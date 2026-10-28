import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { chunk } from '@common/chunk.js';
import { collectPages } from './paging.js';
import { unwrapRow, unwrapRows } from './errors.js';
import type { Json } from './types.js';
import type { DbError } from './errors.js';
import type { AppSupabaseClient } from './supabase.js';
import type {
  GameRef,
  GameSearchHit,
  GameSearchQuery,
  ManualGameInput,
  ManualGameRecord,
  SteamGameInput,
} from './models.js';
import {
  DB_PAGE_SIZE,
  MANUAL_SOURCE,
  NAME_MATCH_LIMIT,
  STEAM_SOURCE,
  UPSERT_CHUNK_SIZE,
} from './constants.js';

export interface GameRepository {
  listSteamAppIds(): Promise<Result<ReadonlySet<number>, DbError>>;
  upsertSteamGames(
    games: readonly SteamGameInput[],
  ): Promise<Result<GameRef[], DbError>>;
  findByName(name: string): Promise<Result<GameRef[], DbError>>;
  searchManual(query: string): Promise<Result<ManualGameRecord[], DbError>>;
  /** Name or tag/genre match across the catalog, best name order first. */
  search(query: GameSearchQuery): Promise<Result<GameSearchHit[], DbError>>;
  insertManual(game: ManualGameInput): Promise<Result<GameRef, DbError>>;
  /** Names of every manual game: things the user already knows, whatever the search term. */
  listManualNames(): Promise<Result<string[], DbError>>;
  getManualByExternalId(
    externalId: string,
  ): Promise<Result<ManualGameRecord | null, DbError>>;
  /** Cascades to user_library and reviews (FK ON DELETE CASCADE). `null` if the id does not exist. */
  deleteById(id: string): Promise<Result<GameRef | null, DbError>>;
}

interface GameRowSlice {
  id: string;
  steam_appid: number | null;
  name: string;
}

interface ManualRowSlice {
  id: string;
  external_id: string | null;
  name: string;
  metadata: unknown;
}

function toManualRecord({
  id,
  external_id,
  name,
  metadata,
}: ManualRowSlice): ManualGameRecord {
  return { id, externalId: external_id, name, metadata };
}

function toGameRef({ id, steam_appid, name }: GameRowSlice): GameRef {
  return { id, steamAppId: steam_appid, name };
}

// A value inside `or=(...)` must be double-quoted when it can hold , . : ( ) — and quotes/backslashes escaped.
function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

// `\`, `%` and `_` are LIKE wildcards/escape: a game named "100% Orange Juice" must match literally.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function createGameRepository(
  client: AppSupabaseClient,
): GameRepository {
  async function fetchAppIdsPage(
    offset: number,
  ): Promise<Result<number[], DbError>> {
    const outcome = await client
      .from('games')
      .select('steam_appid')
      .eq('source', STEAM_SOURCE)
      .not('steam_appid', 'is', null)
      .order('steam_appid')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    const rows = unwrapRows('games.listSteamAppIds', outcome);
    if (!rows.ok) {
      return rows;
    }
    const appIds = rows.value.flatMap(({ steam_appid }) =>
      steam_appid === null ? [] : [steam_appid],
    );
    return ok(appIds);
  }

  async function fetchManualNamesPage(
    offset: number,
  ): Promise<Result<string[], DbError>> {
    const outcome = await client
      .from('games')
      .select('name')
      .eq('source', MANUAL_SOURCE)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    const rows = unwrapRows('games.listManualNames', outcome);
    return rows.ok ? ok(rows.value.map(({ name }) => name)) : rows;
  }

  async function upsertChunk(
    games: readonly SteamGameInput[],
  ): Promise<Result<GameRef[], DbError>> {
    // `metadata` is deliberately absent: on conflict PostgREST only touches the
    // columns present in the payload, so enriched metadata survives a re-sync.
    const rows = games.map(({ steamAppId, name }) => ({
      steam_appid: steamAppId,
      external_id: String(steamAppId),
      source: STEAM_SOURCE,
      name,
    }));
    const outcome = await client
      .from('games')
      .upsert(rows, { onConflict: 'steam_appid' })
      .select('id, steam_appid, name');
    const upserted = unwrapRows('games.upsertSteamGames', outcome);
    return upserted.ok ? ok(upserted.value.map(toGameRef)) : upserted;
  }

  return {
    async listSteamAppIds() {
      const appIds = await collectPages(fetchAppIdsPage);
      return appIds.ok ? ok(new Set(appIds.value)) : appIds;
    },

    async upsertSteamGames(games) {
      const upserted: GameRef[] = [];
      for (const batch of chunk(games, UPSERT_CHUNK_SIZE)) {
        const result = await upsertChunk(batch);
        if (!result.ok) {
          return err(result.error);
        }
        upserted.push(...result.value);
      }
      return ok(upserted);
    },

    async findByName(name) {
      const outcome = await client
        .from('games')
        .select('id, steam_appid, name')
        .ilike('name', `%${escapeLikePattern(name)}%`)
        .order('name')
        .limit(NAME_MATCH_LIMIT);
      const rows = unwrapRows('games.findByName', outcome);
      return rows.ok ? ok(rows.value.map(toGameRef)) : rows;
    },

    async search({ query, source, limit }) {
      const pattern = quoteFilterValue(`%${escapeLikePattern(query)}%`);
      const base = client
        .from('games')
        .select('id, source, steam_appid, name, metadata')
        .or(
          [
            `name.ilike.${pattern}`,
            `metadata->>tags.ilike.${pattern}`,
            `metadata->>genres.ilike.${pattern}`,
          ].join(','),
        );
      const outcome = await (
        source === 'all' ? base : base.eq('source', source)
      )
        .order('name')
        .limit(limit);
      const rows = unwrapRows('games.search', outcome);
      return rows.ok
        ? ok(
            rows.value.map(
              ({ id, source: rowSource, steam_appid, name, metadata }) => ({
                id,
                source: rowSource,
                steamAppId: steam_appid,
                name,
                metadata,
              }),
            ),
          )
        : rows;
    },

    async insertManual({ externalId, name, metadata }) {
      const outcome = await client
        .from('games')
        .insert({
          source: MANUAL_SOURCE,
          external_id: externalId,
          name,
          metadata: metadata as Json,
        })
        .select('id, steam_appid, name')
        .single();
      const row = unwrapRow('games.insertManual', outcome);
      return row.ok ? ok(toGameRef(row.value)) : row;
    },

    async searchManual(query) {
      const outcome = await client
        .from('games')
        .select('id, external_id, name, metadata')
        .eq('source', MANUAL_SOURCE)
        .ilike('name', `%${escapeLikePattern(query)}%`)
        .order('name')
        .limit(NAME_MATCH_LIMIT);
      const rows = unwrapRows('games.searchManual', outcome);
      return rows.ok ? ok(rows.value.map(toManualRecord)) : rows;
    },

    listManualNames() {
      return collectPages(fetchManualNamesPage);
    },

    async getManualByExternalId(externalId) {
      const outcome = await client
        .from('games')
        .select('id, external_id, name, metadata')
        .eq('source', MANUAL_SOURCE)
        .eq('external_id', externalId)
        .limit(1);
      const rows = unwrapRows('games.getManualByExternalId', outcome);
      if (!rows.ok) {
        return rows;
      }
      const [row] = rows.value;
      return ok(row ? toManualRecord(row) : null);
    },

    async deleteById(id) {
      const outcome = await client
        .from('games')
        .delete()
        .eq('id', id)
        .select('id, steam_appid, name');
      const rows = unwrapRows('games.deleteById', outcome);
      if (!rows.ok) {
        return rows;
      }
      const [row] = rows.value;
      return ok(row ? toGameRef(row) : null);
    },
  };
}
