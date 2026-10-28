import { ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { collectPages } from './paging.js';
import { unwrapRow, unwrapRows } from './errors.js';
import type { DbError } from './errors.js';
import type { AppSupabaseClient } from './supabase.js';
import type {
  ReviewInput,
  ReviewExport,
  ReviewPatch,
  ReviewRecord,
  ReviewTagSample,
} from './models.js';
import { DB_PAGE_SIZE } from './constants.js';

export interface ReviewRepository {
  insert(review: ReviewInput): Promise<Result<{ id: string }, DbError>>;
  /** Active (not soft-deleted) reviews of the user: only what profile aggregation needs. */
  listTagSamples(): Promise<Result<ReviewTagSample[], DbError>>;
  /** Every active review with its game, for the weekly backup. */
  listForBackup(): Promise<Result<ReviewExport[], DbError>>;
  /** `null` when the review does not exist, is deleted, or belongs to someone else. */
  update(
    reviewId: string,
    patch: ReviewPatch,
    now: Date,
  ): Promise<Result<ReviewRecord | null, DbError>>;
  /** Sets `deleted_at`. `null` when there is no active review with that id for the user. */
  softDelete(
    reviewId: string,
    now: Date,
  ): Promise<Result<{ id: string } | null, DbError>>;
}

const REVIEW_COLUMNS =
  'id, text, auto_rank, extracted_tags, updated_at, games(name)';

export function createReviewRepository(
  client: AppSupabaseClient,
  userId: string,
): ReviewRepository {
  async function fetchTagSamplesPage(
    offset: number,
  ): Promise<Result<ReviewTagSample[], DbError>> {
    const outcome = await client
      .from('reviews')
      .select('auto_rank, extracted_tags')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    const rows = unwrapRows('reviews.listTagSamples', outcome);
    return rows.ok
      ? ok(
          rows.value.map(({ auto_rank, extracted_tags }) => ({
            autoRank: auto_rank,
            extractedTags: extracted_tags ?? [],
          })),
        )
      : rows;
  }

  async function fetchBackupPage(
    offset: number,
  ): Promise<Result<ReviewExport[], DbError>> {
    const outcome = await client
      .from('reviews')
      .select(
        'id, text, auto_rank, extracted_tags, created_at, updated_at, games(id, name, source, steam_appid, external_id, metadata)',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    const rows = unwrapRows('reviews.listForBackup', outcome);
    return rows.ok
      ? ok(
          rows.value.map((row) => ({
            id: row.id,
            text: row.text,
            autoRank: row.auto_rank,
            extractedTags: row.extracted_tags ?? [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            game: row.games
              ? {
                  id: row.games.id,
                  name: row.games.name,
                  source: row.games.source,
                  steamAppId: row.games.steam_appid,
                  externalId: row.games.external_id,
                  metadata: row.games.metadata,
                }
              : null,
          })),
        )
      : rows;
  }

  return {
    async insert({ gameId, text, autoRank, extractedTags }) {
      const outcome = await client
        .from('reviews')
        .insert({
          user_id: userId,
          game_id: gameId,
          text,
          auto_rank: autoRank,
          extracted_tags: extractedTags,
        })
        .select('id')
        .single();
      const row = unwrapRow('reviews.insert', outcome);
      return row.ok ? ok({ id: row.value.id }) : row;
    },

    listForBackup() {
      return collectPages(fetchBackupPage);
    },

    listTagSamples() {
      return collectPages(fetchTagSamplesPage);
    },

    async update(reviewId, { text, autoRank, extractedTags }, now) {
      const outcome = await client
        .from('reviews')
        .update({
          ...(text !== undefined && { text }),
          ...(autoRank !== undefined && { auto_rank: autoRank }),
          ...(extractedTags !== undefined && { extracted_tags: extractedTags }),
          updated_at: now.toISOString(),
        })
        .eq('id', reviewId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select(REVIEW_COLUMNS);
      const rows = unwrapRows('reviews.update', outcome);
      if (!rows.ok) {
        return rows;
      }
      const [row] = rows.value;
      return ok(
        row
          ? {
              id: row.id,
              gameName: row.games?.name ?? '',
              text: row.text,
              autoRank: row.auto_rank,
              extractedTags: row.extracted_tags ?? [],
              updatedAt: row.updated_at,
            }
          : null,
      );
    },

    async softDelete(reviewId, now) {
      const outcome = await client
        .from('reviews')
        .update({ deleted_at: now.toISOString() })
        .eq('id', reviewId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select('id');
      const rows = unwrapRows('reviews.softDelete', outcome);
      if (!rows.ok) {
        return rows;
      }
      const [row] = rows.value;
      return ok(row ? { id: row.id } : null);
    },
  };
}
