import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { GameSource } from '@db/types.js';
import { normalizeTag } from '@services/tags.js';
import type { Game, GameProvider, ProviderError } from './types.js';

export interface SearchOutcome {
  games: Game[];
  /** Providers that failed while others answered: the result is partial. */
  failures: ProviderError[];
}

export interface GameProviderService {
  search(query: string): Promise<Result<SearchOutcome, ProviderError>>;
  fetch(
    source: GameSource,
    externalId: string,
  ): Promise<Result<Game, ProviderError>>;
}

// Providers are listed by priority: on a name clash the earlier one wins
// (manual first — what the user typed is the source of truth).
export function createGameProviderService(
  providers: readonly GameProvider[],
): GameProviderService {
  return {
    async search(query) {
      const answers = await Promise.all(
        providers.map((provider) => provider.search(query)),
      );
      const failures = answers.flatMap((answer) =>
        answer.ok ? [] : [answer.error],
      );
      const [firstFailure] = failures;
      if (firstFailure && failures.length === providers.length) {
        return err(firstFailure);
      }

      const hits = answers.flatMap((answer) => (answer.ok ? answer.value : []));
      const byName = new Map<string, Game>();
      hits.forEach((game) => {
        const key = normalizeTag(game.name);
        if (!byName.has(key)) {
          byName.set(key, game);
        }
      });
      return ok({ games: [...byName.values()], failures });
    },

    async fetch(source, externalId) {
      const provider = providers.find(
        (candidate) => candidate.source === source,
      );
      if (!provider) {
        return err({
          provider: source,
          kind: 'unavailable',
          message: `No provider registered for source "${source}"`,
        });
      }
      return provider.fetch(externalId);
    },
  };
}
