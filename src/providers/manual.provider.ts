import { err, ok } from '@common/result.js';
import type { GameRepository, ManualGameRecord } from '@db/index.js';
import { normalizeTags } from '@services/tags.js';
import { readManualMetadata } from './manual-metadata.js';
import type { Game, GameProvider, ProviderError } from './types.js';

const unavailable = (message: string): ProviderError => ({
  provider: 'manual',
  kind: 'unavailable',
  message: `Database: ${message}`,
});

function toGame({ externalId, id, name, metadata }: ManualGameRecord): Game {
  const { genres, tags, priceUSD, description, storeUrl } =
    readManualMetadata(metadata);
  return {
    source: 'manual',
    externalId: externalId ?? id,
    steamAppId: null,
    name,
    tags: normalizeTags([...tags, ...genres]),
    priceUSD,
    storeUrl,
    description,
    detailed: true,
  };
}

export function createManualProvider(games: GameRepository): GameProvider {
  return {
    source: 'manual',

    async fetch(externalId) {
      const found = await games.getManualByExternalId(externalId);
      if (!found.ok) {
        return err(unavailable(found.error.message));
      }
      if (found.value === null) {
        return err({
          provider: 'manual',
          kind: 'not_found',
          message: `Manual game "${externalId}" not found`,
        });
      }
      return ok(toGame(found.value));
    },

    async search(query) {
      const found = await games.searchManual(query);
      return found.ok
        ? ok(found.value.map(toGame))
        : err(unavailable(found.error.message));
    },
  };
}
