import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import {
  CENTS_PER_UNIT,
  STEAM_STORE_BASE_URL,
  STORE_APP_DETAILS_PATH,
  STORE_APP_URL_PATH,
  STORE_COUNTRY_CODE,
  STORE_GAME_TYPE,
  STORE_LANGUAGE,
  STORE_PRICE_CURRENCY,
  STORE_SEARCH_PATH,
} from './constants.js';
import { createRetryingGet, isSuccess, parseJson } from './http.js';
import type { HttpOptions, RawResponse } from './http.js';
import {
  storeAppDetailsResponseSchema,
  storeSearchResponseSchema,
} from './store-types.js';
import type {
  StoreAppDetails,
  StoreClient,
  StoreSearchItem,
} from './store-types.js';
import type { SteamError } from './types.js';

export interface StoreClientConfig extends HttpOptions {
  baseUrl?: string;
}

const toUsd = ({ currency, final }: { currency: string; final: number }) =>
  currency === STORE_PRICE_CURRENCY ? final / CENTS_PER_UNIT : null;

export const buildStoreUrl = (appId: number): string =>
  `${STEAM_STORE_BASE_URL}${STORE_APP_URL_PATH}/${appId}`;

function decodeBody(raw: RawResponse): Result<unknown, SteamError> {
  if (!isSuccess(raw.status)) {
    return err({
      kind: 'http',
      status: raw.status,
      message: `Steam Store answered HTTP ${raw.status}`,
    });
  }
  return parseJson(raw.body);
}

const invalidShape = (what: string): SteamError => ({
  kind: 'invalid_response',
  message: `Steam Store ${what} response does not match the expected shape`,
});

export function createStoreClient({
  baseUrl = STEAM_STORE_BASE_URL,
  ...httpOptions
}: StoreClientConfig = {}): StoreClient {
  const get = createRetryingGet(httpOptions);

  function buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(path, baseUrl);
    Object.entries({
      ...params,
      cc: STORE_COUNTRY_CODE,
      l: STORE_LANGUAGE,
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  return {
    async search(term) {
      const raw = await get(buildUrl(STORE_SEARCH_PATH, { term }));
      if (!raw.ok) {
        return raw;
      }
      const json = decodeBody(raw.value);
      if (!json.ok) {
        return json;
      }
      const parsed = storeSearchResponseSchema.safeParse(json.value);
      if (!parsed.success) {
        return err(invalidShape('search'));
      }
      const items: StoreSearchItem[] = parsed.data.items.map(
        ({ id, name, price }) => ({
          appId: id,
          name,
          priceUSD: price ? toUsd(price) : null,
        }),
      );
      return ok(items);
    },

    async getAppDetails(appId) {
      const raw = await get(
        buildUrl(STORE_APP_DETAILS_PATH, { appids: String(appId) }),
      );
      if (!raw.ok) {
        return raw;
      }
      const json = decodeBody(raw.value);
      if (!json.ok) {
        return json;
      }
      const parsed = storeAppDetailsResponseSchema.safeParse(json.value);
      if (!parsed.success) {
        return err(invalidShape('appdetails'));
      }
      const entry = parsed.data[String(appId)];
      if (
        !entry?.success ||
        !entry.data ||
        entry.data.type !== STORE_GAME_TYPE
      ) {
        return ok(null);
      }
      const {
        name,
        steam_appid,
        is_free,
        short_description,
        genres,
        categories,
        price_overview,
      } = entry.data;
      const details: StoreAppDetails = {
        appId: steam_appid,
        name,
        isFree: is_free ?? false,
        priceUSD: is_free ? 0 : price_overview ? toUsd(price_overview) : null,
        genres: (genres ?? []).map(({ description }) => description),
        categories: (categories ?? []).map(({ description }) => description),
        description: short_description ?? '',
        storeUrl: buildStoreUrl(steam_appid),
      };
      return ok(details);
    },
  };
}
