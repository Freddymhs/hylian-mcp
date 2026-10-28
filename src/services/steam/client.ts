import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import {
  FALLBACK_NAME_PREFIX,
  GET_OWNED_GAMES_PATH,
  SECONDS_TO_MS,
  STEAM_API_BASE_URL,
} from './constants.js';
import { createRetryingGet, isSuccess, parseJson } from './http.js';
import type { HttpOptions, RawResponse } from './http.js';
import { steamOwnedGamesResponseSchema } from './types.js';
import type {
  SteamClient,
  SteamError,
  SteamGame,
  SteamOwnedGame,
} from './types.js';

export interface SteamClientConfig extends HttpOptions {
  apiKey: string;
  steamId: string;
  baseUrl?: string;
}

function toSteamGame({
  appid,
  name,
  playtime_forever,
  rtime_last_played,
}: SteamOwnedGame): SteamGame {
  const hasBeenPlayed =
    rtime_last_played !== undefined && rtime_last_played > 0;
  return {
    appId: appid,
    name: name ?? `${FALLBACK_NAME_PREFIX} ${appid}`,
    playtimeMinutes: playtime_forever,
    lastPlayedAt: hasBeenPlayed
      ? new Date(rtime_last_played * SECONDS_TO_MS).toISOString()
      : null,
  };
}

export function createSteamClient({
  apiKey,
  steamId,
  baseUrl = STEAM_API_BASE_URL,
  ...httpOptions
}: SteamClientConfig): SteamClient {
  const get = createRetryingGet(httpOptions);

  // The URL carries the API key: it must never reach a log line or an error message.
  function buildOwnedGamesUrl(): string {
    const url = new URL(GET_OWNED_GAMES_PATH, baseUrl);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamid', steamId);
    url.searchParams.set('include_appinfo', '1');
    url.searchParams.set('include_played_free_games', '1');
    url.searchParams.set('format', 'json');
    return url.toString();
  }

  function parseOwnedGames(raw: RawResponse): Result<SteamGame[], SteamError> {
    if (!isSuccess(raw.status)) {
      return err({
        kind: 'http',
        status: raw.status,
        message:
          raw.status === 403
            ? 'Steam rejected the request (HTTP 403): check STEAM_API_KEY'
            : `Steam answered HTTP ${raw.status}`,
      });
    }
    const json = parseJson(raw.body);
    if (!json.ok) {
      return json;
    }
    const parsed = steamOwnedGamesResponseSchema.safeParse(json.value);
    if (!parsed.success) {
      return err({
        kind: 'invalid_response',
        message: 'Steam response does not match the GetOwnedGames shape',
      });
    }
    const { game_count, games } = parsed.data.response;
    if (game_count === undefined && games === undefined) {
      return err({
        kind: 'no_library_data',
        message:
          'Steam returned no library data: the profile game details are private, or STEAM_ID is wrong',
      });
    }
    return ok((games ?? []).map(toSteamGame));
  }

  return {
    async getOwnedGames() {
      const raw = await get(buildOwnedGamesUrl());
      return raw.ok ? parseOwnedGames(raw.value) : raw;
    },
  };
}
