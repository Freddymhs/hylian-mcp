import { logger } from '@common/logger.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { ProfileRepository, ReviewRepository } from '@db/index.js';
import { fromDbError } from '../errors.js';
import type { ServiceError } from '../errors.js';
import { computeTagWeights } from './aggregate.js';
import { PROFILE_TTL_MS } from './constants.js';
import type { ProfileSnapshot } from './types.js';

export interface ProfileService {
  /** Cached profile when younger than 24 h, otherwise recomputed from the reviews. */
  get(options?: {
    force?: boolean;
  }): Promise<Result<ProfileSnapshot, ServiceError>>;
  /**
   * Recompute after a review changed. A failure here must not fail the review itself,
   * so it is logged and swallowed: the stale cache is replaced on the next successful run.
   */
  refreshQuietly(): Promise<void>;
}

export interface ProfileServiceDeps {
  reviews: ReviewRepository;
  profile: ProfileRepository;
  clock?: () => Date;
  ttlMs?: number;
}

export function createProfileService({
  reviews,
  profile,
  clock = () => new Date(),
  ttlMs = PROFILE_TTL_MS,
}: ProfileServiceDeps): ProfileService {
  async function compute(): Promise<Result<ProfileSnapshot, ServiceError>> {
    const samples = await reviews.listTagSamples();
    if (!samples.ok) {
      return err(fromDbError(samples.error));
    }
    const snapshot = {
      tagWeights: computeTagWeights(samples.value),
      computedAt: clock().toISOString(),
    };
    const saved = await profile.save(snapshot);
    if (!saved.ok) {
      return err(fromDbError(saved.error));
    }
    return ok({ ...snapshot, fromCache: false });
  }

  async function get({ force = false }: { force?: boolean } = {}) {
    if (!force) {
      const cached = await profile.get();
      if (!cached.ok) {
        return err(fromDbError(cached.error));
      }
      const isFresh =
        cached.value !== null &&
        clock().getTime() - Date.parse(cached.value.computedAt) < ttlMs;
      if (cached.value !== null && isFresh) {
        return ok({ ...cached.value, fromCache: true });
      }
    }
    return compute();
  }

  return {
    get,
    async refreshQuietly() {
      const refreshed = await get({ force: true });
      if (!refreshed.ok) {
        logger.warn(
          { reason: refreshed.error.message },
          'Profile refresh failed; cached profile may be stale',
        );
      }
    },
  };
}
