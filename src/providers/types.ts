import type { Result } from '@common/result.js';
import type { GameSource } from '@db/types.js';

export interface Game {
  source: GameSource;
  externalId: string;
  steamAppId: number | null;
  name: string;
  /** Normalized (see services/tags). Empty when `detailed` is false. */
  tags: string[];
  priceUSD: number | null;
  storeUrl: string | null;
  description: string;
  /** `false` for lightweight search hits: call `fetch` to get tags and the final price. */
  detailed: boolean;
}

export type ProviderErrorKind = 'not_found' | 'unavailable' | 'invalid_input';

export interface ProviderError {
  readonly provider: GameSource;
  readonly kind: ProviderErrorKind;
  readonly message: string;
}

export interface GameProvider {
  readonly source: GameSource;
  fetch(externalId: string): Promise<Result<Game, ProviderError>>;
  search(query: string): Promise<Result<Game[], ProviderError>>;
}
