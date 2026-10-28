import { z } from 'zod';
import type { Result } from '@common/result.js';
import type { SteamError } from './types.js';

// The Store API is not officially documented by Valve. Shapes below follow the community
// reference (https://wiki.teamfortress.com/wiki/User:RJackson/StorefrontAPI) and live responses.
// Prices are integers in the smallest currency unit (cents) and absent for free apps.
const storePriceSchema = z.object({
  currency: z.string(),
  initial: z.number().int().nonnegative(),
  final: z.number().int().nonnegative(),
});

export const storeSearchResponseSchema = z.object({
  total: z.number().int().nonnegative().optional(),
  items: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      id: z.number().int(),
      price: storePriceSchema.optional(),
    }),
  ),
});

// `genres[].id` is a string in appdetails while `categories[].id` is a number.
const storeLabelSchema = z.object({
  id: z.union([z.string(), z.number()]),
  description: z.string(),
});

export const storeAppDetailsDataSchema = z.object({
  type: z.string(),
  name: z.string(),
  steam_appid: z.number().int(),
  is_free: z.boolean().optional(),
  short_description: z.string().optional(),
  genres: z.array(storeLabelSchema).optional(),
  categories: z.array(storeLabelSchema).optional(),
  price_overview: storePriceSchema.optional(),
});

// Keyed by the requested appid; `{ "<id>": { "success": false } }` for unknown or region-locked apps.
export const storeAppDetailsResponseSchema = z.record(
  z.string(),
  z.object({
    success: z.boolean(),
    data: storeAppDetailsDataSchema.optional(),
  }),
);

export interface StoreSearchItem {
  appId: number;
  name: string;
  /** USD; `null` when the search result carries no price (free, unreleased, other currency). */
  priceUSD: number | null;
}

export interface StoreAppDetails {
  appId: number;
  name: string;
  priceUSD: number | null;
  isFree: boolean;
  genres: string[];
  categories: string[];
  description: string;
  storeUrl: string;
}

export interface StoreClient {
  search(term: string): Promise<Result<StoreSearchItem[], SteamError>>;
  /** `ok(null)` when Steam answers `success: false` or the app is not a game. */
  getAppDetails(
    appId: number,
  ): Promise<Result<StoreAppDetails | null, SteamError>>;
}
