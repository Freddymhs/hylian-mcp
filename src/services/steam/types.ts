import { z } from 'zod';
import type { Result } from '@common/result.js';

// Shape documented for IPlayerService/GetOwnedGames/v1 (include_appinfo=1):
// https://developer.valvesoftware.com/wiki/Steam_Web_API#GetOwnedGames_.28v0001.29
// `rtime_last_played` is unix seconds, 0 when never played; playtime is in minutes.
// A private profile answers `{ "response": {} }`.
export const steamOwnedGameSchema = z.object({
  appid: z.number().int(),
  name: z.string().optional(),
  playtime_forever: z.number().int().nonnegative().default(0),
  rtime_last_played: z.number().int().nonnegative().optional(),
});

export const steamOwnedGamesResponseSchema = z.object({
  response: z.object({
    game_count: z.number().int().nonnegative().optional(),
    games: z.array(steamOwnedGameSchema).optional(),
  }),
});

export type SteamOwnedGame = z.infer<typeof steamOwnedGameSchema>;
export type SteamOwnedGamesResponse = z.infer<
  typeof steamOwnedGamesResponseSchema
>;

export interface SteamGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
}

export type SteamErrorKind =
  | 'http'
  | 'network'
  | 'timeout'
  | 'invalid_response'
  | 'no_library_data';

export interface SteamError {
  readonly kind: SteamErrorKind;
  readonly message: string;
  readonly status?: number;
}

export interface SteamClient {
  getOwnedGames(): Promise<Result<SteamGame[], SteamError>>;
}
