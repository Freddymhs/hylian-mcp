import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { ServiceError } from '../errors.js';
import type { ProfileService } from '../profile/service.js';
import { normalizeTags } from '../tags.js';
import { matchProfile, toRelativeScore } from './score.js';
import { loadTagWeights } from './tag-weights.js';

export interface RankCandidate {
  name: string;
  /** Free-form; normalized here like review tags. */
  tags: readonly string[];
}

export interface RankedGame {
  name: string;
  /** 0-100, relative to the best game of this list. */
  score: number;
  matchedTags: string[];
}

export interface Ranking {
  ranked: RankedGame[];
  /** Games that share no tag with the profile, in input order. */
  unmatched: string[];
}

// Ranks a list the caller brings (any source: VR ports, a friend's library…) with the same
// scoring as recommend_purchase, without searching any store.
export async function rankGames(
  profile: ProfileService,
  candidates: readonly RankCandidate[],
): Promise<Result<Ranking, ServiceError>> {
  const weights = await loadTagWeights(profile);
  if (!weights.ok) {
    return err(weights.error);
  }

  const matches = candidates.map(({ name, tags }) => ({
    name,
    ...matchProfile(normalizeTags(tags), weights.value),
  }));
  const matched = matches.filter(({ raw }) => raw > 0);
  const best = Math.max(0, ...matched.map(({ raw }) => raw));

  const ranked = [...matched]
    .sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name))
    .map(({ name, matchedTags, raw }) => ({
      name,
      score: toRelativeScore(raw, best),
      matchedTags,
    }));
  const unmatched = matches
    .filter(({ raw }) => raw === 0)
    .map(({ name }) => name);
  return ok({ ranked, unmatched });
}
