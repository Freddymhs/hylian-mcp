// PostgREST caps a response at 1000 rows by default.
export const DB_PAGE_SIZE = 1000;
export const UPSERT_CHUNK_SIZE = 500;
export const NAME_MATCH_LIMIT = 25;

export const STEAM_SOURCE = 'steam' as const;
export const MANUAL_SOURCE = 'manual' as const;
