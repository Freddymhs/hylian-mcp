import { logger } from '@common/logger.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { mapInBatches } from '@common/concurrency.js';
import type { GameRepository, LibraryRepository } from '@db/index.js';
import type { Game, GameProviderService } from '@providers/index.js';
import { fromDbError } from '../errors.js';
import type { ServiceError } from '../errors.js';
import type { ProfileService } from '../profile/service.js';
import type { TagWeights } from '../profile/types.js';
import { normalizeTag } from '../tags.js';
import {
  DETAIL_CONCURRENCY,
  MAX_DETAIL_CANDIDATES,
  SEARCH_TERMS_FROM_PROFILE,
} from './constants.js';
import { loadTagWeights } from './tag-weights.js';
import { isOwned, scoreCandidates } from './score.js';
import type { ScoredGame } from './score.js';

export interface RecommendDeps {
  profile: ProfileService;
  providers: GameProviderService;
  library: LibraryRepository;
  games: GameRepository;
}

export interface RecommendRequest {
  criteria?: string;
  maxPrice?: number;
  limit: number;
}

export interface Recommendation {
  recommendations: ScoredGame[];
  /** Candidates that reached scoring (after ownership, price and detail filters). */
  evaluated: number;
  /** Candidates dropped because Steam could not give their details. */
  skipped: number;
  /** Providers that failed while others answered: the result may be incomplete. */
  warnings: string[];
}

const topTags = (tagWeights: TagWeights, count: number) =>
  Object.keys(tagWeights).slice(0, count);

// Steam user tags are not in the Store API; profile tags that appear as whole words in the
// description are a cheap way to catch e.g. "metroidvania" when it is not a genre label.
function withDescriptionTags(game: Game, tagWeights: TagWeights): Game {
  const text = ` ${normalizeTag(game.description)} `;
  const found = Object.keys(tagWeights).filter((tag) =>
    text.includes(` ${tag} `),
  );
  return { ...game, tags: [...new Set([...game.tags, ...found])] };
}

const isWithinBudget = (game: Game, maxPrice: number | undefined) =>
  maxPrice === undefined ||
  (game.priceUSD !== null && game.priceUSD <= maxPrice);

// A hit that already shows a price above the ceiling is dropped before spending a detail request.
const isKnownTooExpensive = (game: Game, maxPrice: number | undefined) =>
  maxPrice !== undefined && game.priceUSD !== null && game.priceUSD > maxPrice;

export async function recommendPurchases(
  { profile, providers, library, games }: RecommendDeps,
  { criteria, maxPrice, limit }: RecommendRequest,
): Promise<Result<Recommendation, ServiceError>> {
  const weights = await loadTagWeights(profile);
  if (!weights.ok) {
    return err(weights.error);
  }
  const tagWeights = weights.value;

  const owned = await library.list('all');
  if (!owned.ok) {
    return err(fromDbError(owned.error));
  }
  const manualNames = await games.listManualNames();
  if (!manualNames.ok) {
    return err(fromDbError(manualNames.error));
  }
  const ownedGames = {
    steamAppIds: new Set(
      owned.value.flatMap(({ steamAppId }) =>
        steamAppId === null ? [] : [steamAppId],
      ),
    ),
    // Library plus every manual game: what the user already knows is never a purchase tip.
    names: new Set(
      [...owned.value.map(({ name }) => name), ...manualNames.value].map(
        normalizeTag,
      ),
    ),
  };

  const terms = criteria?.trim()
    ? [criteria.trim()]
    : topTags(tagWeights, SEARCH_TERMS_FROM_PROFILE);
  const searches = await Promise.all(
    terms.map((term) => providers.search(term)),
  );
  const answered = searches.flatMap((search) =>
    search.ok ? [search.value] : [],
  );
  const warnings = [
    ...new Set([
      ...searches.flatMap((search) =>
        search.ok ? [] : [search.error.message],
      ),
      ...answered.flatMap(({ failures }) =>
        failures.map(({ message }) => message),
      ),
    ]),
  ];
  const [firstSearch] = searches;
  if (answered.length === 0 && firstSearch && !firstSearch.ok) {
    return err({
      kind: 'steam',
      message: `Could not search for candidates: ${firstSearch.error.message}`,
    });
  }

  // A game found by several terms is a stronger candidate: it goes first when the budget cuts.
  // Map keeps insertion order and Array.sort is stable, so ties keep the search order.
  // Manual-source hits are dropped as well (the provider dedupe keeps them over a Steam hit).
  const hits = new Map<string, { game: Game; count: number }>();
  answered
    .flatMap(({ games }) => games)
    .forEach((game) => {
      const key = normalizeTag(game.name);
      const seen = hits.get(key);
      hits.set(key, {
        game: seen?.game ?? game,
        count: (seen?.count ?? 0) + 1,
      });
    });
  const candidates = [...hits.values()]
    .filter(({ game }) => game.source !== 'manual')
    .filter(({ game }) => !isKnownTooExpensive(game, maxPrice))
    .filter(({ game }) => !isOwned(game, ownedGames))
    .sort((a, b) => b.count - a.count)
    .map(({ game }) => game)
    .slice(0, MAX_DETAIL_CANDIDATES);

  const detailed = await mapInBatches(
    candidates,
    DETAIL_CONCURRENCY,
    async (game) => {
      if (game.detailed) {
        return ok(game);
      }
      return providers.fetch(game.source, game.externalId);
    },
  );
  const skipped = detailed.filter((result) => !result.ok).length;
  if (skipped > 0) {
    logger.warn(
      { skipped },
      'Some candidates were skipped: details unavailable',
    );
  }

  const enriched = detailed
    .flatMap((result) => (result.ok ? [result.value] : []))
    .map((game) => withDescriptionTags(game, tagWeights))
    .filter((game) => isWithinBudget(game, maxPrice));

  const recommendations = scoreCandidates({
    tagWeights,
    candidates: enriched,
    owned: ownedGames,
    limit,
  });
  return ok({ recommendations, evaluated: enriched.length, skipped, warnings });
}
