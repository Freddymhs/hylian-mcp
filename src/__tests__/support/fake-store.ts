import { err, ok } from '@common/result.js';
import type {
  StoreAppDetails,
  StoreClient,
  StoreSearchItem,
} from '@services/steam/index.js';

export interface FakeStoreData {
  /** Search results by term (exact match); unknown terms return no hits. */
  search?: Record<string, StoreSearchItem[]>;
  /** App details by appid; `null` = Steam answers success:false. Missing = network failure. */
  details?: Record<number, StoreAppDetails | null>;
  searchFails?: boolean;
}

export interface FakeStore extends StoreClient {
  searchedTerms: string[];
  detailRequests: number[];
}

export function createFakeStore({
  search = {},
  details = {},
  searchFails = false,
}: FakeStoreData = {}): FakeStore {
  const searchedTerms: string[] = [];
  const detailRequests: number[] = [];

  return {
    searchedTerms,
    detailRequests,
    async search(term) {
      searchedTerms.push(term);
      return searchFails
        ? err({ kind: 'network', message: 'Could not reach Steam' })
        : ok(search[term] ?? []);
    },
    async getAppDetails(appId) {
      detailRequests.push(appId);
      const found = details[appId];
      return found === undefined
        ? err({ kind: 'network', message: 'Could not reach Steam' })
        : ok(found);
    },
  };
}

export function storeDetails(
  appId: number,
  overrides: Partial<StoreAppDetails> = {},
): StoreAppDetails {
  return {
    appId,
    name: `Game ${appId}`,
    priceUSD: 19.99,
    isFree: false,
    genres: [],
    categories: [],
    description: '',
    storeUrl: `https://store.steampowered.com/app/${appId}`,
    ...overrides,
  };
}
