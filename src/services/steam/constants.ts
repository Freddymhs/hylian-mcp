export const STEAM_API_BASE_URL = 'https://api.steampowered.com';
export const GET_OWNED_GAMES_PATH = '/IPlayerService/GetOwnedGames/v1/';

export const STEAM_REQUEST_TIMEOUT_MS = 10_000;
// Exponential backoff for 5xx: 3 retries after the first attempt.
export const STEAM_RETRY_DELAYS_MS = [200, 500, 1500] as const;

export const SECONDS_TO_MS = 1000;
export const FALLBACK_NAME_PREFIX = 'Steam App';

export const STEAM_STORE_BASE_URL = 'https://store.steampowered.com';
export const STORE_SEARCH_PATH = '/api/storesearch/';
export const STORE_APP_DETAILS_PATH = '/api/appdetails';
export const STORE_APP_URL_PATH = '/app';
export const STORE_COUNTRY_CODE = 'us';
export const STORE_LANGUAGE = 'english';
export const STORE_GAME_TYPE = 'game';
export const CENTS_PER_UNIT = 100;
export const STORE_PRICE_CURRENCY = 'USD';
