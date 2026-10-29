import type { Game } from '@providers/index.js';
import { normalizeTag } from '../tags.js';
import type { TagWeights } from '../profile/types.js';
import { MAX_SCORE } from './constants.js';

export interface OwnedGames {
  steamAppIds: ReadonlySet<number>;
  /** Normalized names (see services/tags). */
  names: ReadonlySet<string>;
}

export interface ScoredGame {
  game: Game;
  /** 0-100, relative to the best candidate of this run. */
  score: number;
  /** Profile tags the candidate matched, heaviest first. */
  matchedTags: string[];
}

export interface ScoreInput {
  tagWeights: TagWeights;
  candidates: readonly Game[];
  owned: OwnedGames;
  limit: number;
}

export interface ProfileMatch {
  /** Profile tags found in the game's tags, heaviest first. */
  matchedTags: string[];
  /** Σ tag_weights[tag] over matchedTags. */
  raw: number;
}

export function matchProfile(
  tags: readonly string[],
  tagWeights: TagWeights,
): ProfileMatch {
  const matchedTags = tags
    .filter((tag) => tag in tagWeights)
    .sort((a, b) => (tagWeights[b] ?? 0) - (tagWeights[a] ?? 0));
  const raw = matchedTags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
  return { matchedTags, raw };
}

// The best raw score of a run becomes MAX_SCORE.
export function toRelativeScore(raw: number, best: number): number {
  return Math.round((raw / best) * MAX_SCORE);
}

export function isOwned(
  { steamAppId, name }: Game,
  owned: OwnedGames,
): boolean {
  const ownedByAppId = steamAppId !== null && owned.steamAppIds.has(steamAppId);
  return ownedByAppId || owned.names.has(normalizeTag(name));
}

// A candidate that shares no tag with the profile is not recommended.
export function scoreCandidates({
  tagWeights,
  candidates,
  owned,
  limit,
}: ScoreInput): ScoredGame[] {
  const scored = candidates
    .filter((game) => !isOwned(game, owned))
    .map((game) => ({ game, ...matchProfile(game.tags, tagWeights) }))
    .filter(({ raw }) => raw > 0);

  const best = Math.max(0, ...scored.map(({ raw }) => raw));
  return scored
    .map(({ game, matchedTags, raw }) => ({
      game,
      matchedTags,
      raw,
      score: toRelativeScore(raw, best),
    }))
    .sort((a, b) => b.raw - a.raw || a.game.name.localeCompare(b.game.name))
    .slice(0, limit)
    .map(({ game, score, matchedTags }) => ({ game, score, matchedTags }));
}
