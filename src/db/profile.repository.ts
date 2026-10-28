import { z } from 'zod';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { unwrapRows, unwrapVoid } from './errors.js';
import type { DbError } from './errors.js';
import type { AppSupabaseClient } from './supabase.js';
import type { CachedProfile } from './models.js';

export interface ProfileRepository {
  get(): Promise<Result<CachedProfile | null, DbError>>;
  save(profile: CachedProfile): Promise<Result<void, DbError>>;
}

const tagWeightsSchema = z.record(z.string(), z.number());

export function createProfileRepository(
  client: AppSupabaseClient,
  userId: string,
): ProfileRepository {
  return {
    async get() {
      const outcome = await client
        .from('user_profile')
        .select('tag_weights, computed_at')
        .eq('user_id', userId);
      const rows = unwrapRows('user_profile.get', outcome);
      if (!rows.ok) {
        return rows;
      }
      const [row] = rows.value;
      if (!row) {
        return ok(null);
      }
      const tagWeights = tagWeightsSchema.safeParse(row.tag_weights ?? {});
      if (!tagWeights.success || !row.computed_at) {
        return err({
          operation: 'user_profile.get',
          message: 'Cached profile row has an unexpected shape',
        });
      }
      return ok({ tagWeights: tagWeights.data, computedAt: row.computed_at });
    },

    async save({ tagWeights, computedAt }) {
      const outcome = await client.from('user_profile').upsert(
        {
          user_id: userId,
          tag_weights: tagWeights,
          computed_at: computedAt,
        },
        { onConflict: 'user_id' },
      );
      return unwrapVoid('user_profile.save', outcome);
    },
  };
}
