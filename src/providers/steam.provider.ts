import { err, ok } from '@common/result.js';
import type { StoreClient } from '@services/steam/index.js';
import { buildStoreUrl } from '@services/steam/index.js';
import { normalizeTags } from '@services/tags.js';
import type { GameProvider, ProviderError } from './types.js';

const unavailable = (message: string): ProviderError => ({
  provider: 'steam',
  kind: 'unavailable',
  message: `Steam Store: ${message}`,
});

// Metadata comes from the Steam Store API (genres, categories, price). The Web API
// (owned games, playtime) is the sync's job — see services/steam/client.ts.
export function createSteamProvider(store: StoreClient): GameProvider {
  return {
    source: 'steam',

    async fetch(externalId) {
      const appId = Number(externalId);
      if (!Number.isInteger(appId) || appId <= 0) {
        return err({
          provider: 'steam',
          kind: 'invalid_input',
          message: `"${externalId}" is not a Steam appid`,
        });
      }
      const details = await store.getAppDetails(appId);
      if (!details.ok) {
        return err(unavailable(details.error.message));
      }
      if (details.value === null) {
        return err({
          provider: 'steam',
          kind: 'not_found',
          message: `Steam app ${appId} not found in the Store (or it is not a game)`,
        });
      }
      const { name, priceUSD, genres, categories, description, storeUrl } =
        details.value;
      return ok({
        source: 'steam',
        externalId: String(appId),
        steamAppId: appId,
        name,
        tags: normalizeTags([...genres, ...categories]),
        priceUSD,
        storeUrl,
        description,
        detailed: true,
      });
    },

    async search(query) {
      const found = await store.search(query);
      if (!found.ok) {
        return err(unavailable(found.error.message));
      }
      return ok(
        found.value.map(({ appId, name, priceUSD }) => ({
          source: 'steam' as const,
          externalId: String(appId),
          steamAppId: appId,
          name,
          tags: [],
          priceUSD,
          storeUrl: buildStoreUrl(appId),
          description: '',
          detailed: false,
        })),
      );
    },
  };
}
