import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { chunk } from '@common/chunk.js';
import { collectPages } from './paging.js';
import { unwrapRows, unwrapVoid } from './errors.js';
import type { DbError } from './errors.js';
import type { AppSupabaseClient } from './supabase.js';
import type {
  LibraryEntryInput,
  LibraryFilter,
  LibraryItem,
} from './models.js';
import { DB_PAGE_SIZE, UPSERT_CHUNK_SIZE } from './constants.js';

export interface LibraryRepository {
  upsertEntries(
    entries: readonly LibraryEntryInput[],
  ): Promise<Result<void, DbError>>;
  list(filter: LibraryFilter): Promise<Result<LibraryItem[], DbError>>;
}

const LIST_OPERATION = 'user_library.list';

export function createLibraryRepository(
  client: AppSupabaseClient,
  userId: string,
): LibraryRepository {
  async function fetchPage(
    filter: LibraryFilter,
    offset: number,
  ): Promise<Result<LibraryItem[], DbError>> {
    const base = client
      .from('user_library')
      .select('playtime_minutes, last_played, games(id, name, steam_appid)')
      .eq('user_id', userId);
    const filtered =
      filter === 'played'
        ? base.gt('playtime_minutes', 0)
        : filter === 'unplayed'
          ? base.eq('playtime_minutes', 0)
          : base;
    const outcome = await filtered
      .order('game_id')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    const rows = unwrapRows(LIST_OPERATION, outcome);
    if (!rows.ok) {
      return rows;
    }
    const items = rows.value.flatMap(
      ({ playtime_minutes, last_played, games }) =>
        games
          ? [
              {
                gameId: games.id,
                name: games.name,
                steamAppId: games.steam_appid,
                playtimeMinutes: playtime_minutes ?? 0,
                lastPlayed: last_played,
              },
            ]
          : [],
    );
    return ok(items);
  }

  return {
    async upsertEntries(entries) {
      for (const batch of chunk(entries, UPSERT_CHUNK_SIZE)) {
        // `acquired_at` is omitted so it keeps its first-sync value on re-sync.
        const rows = batch.map(({ gameId, playtimeMinutes, lastPlayed }) => ({
          user_id: userId,
          game_id: gameId,
          playtime_minutes: playtimeMinutes,
          last_played: lastPlayed,
        }));
        const outcome = await client
          .from('user_library')
          .upsert(rows, { onConflict: 'user_id,game_id' });
        const result = unwrapVoid('user_library.upsertEntries', outcome);
        if (!result.ok) {
          return err(result.error);
        }
      }
      return ok(undefined);
    },

    list(filter) {
      return collectPages((offset) => fetchPage(filter, offset));
    },
  };
}
