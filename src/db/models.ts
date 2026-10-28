export const LIBRARY_FILTERS = ['all', 'played', 'unplayed'] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export interface GameRef {
  id: string;
  steamAppId: number | null;
  name: string;
}

export interface SteamGameInput {
  steamAppId: number;
  name: string;
}

export interface LibraryEntryInput {
  gameId: string;
  playtimeMinutes: number;
  lastPlayed: string | null;
}

export interface LibraryItem {
  gameId: string;
  name: string;
  steamAppId: number | null;
  playtimeMinutes: number;
  lastPlayed: string | null;
}

export interface ReviewInput {
  gameId: string;
  text: string;
  autoRank: number | null;
  extractedTags: string[];
}

export interface ReviewTagSample {
  autoRank: number | null;
  extractedTags: string[];
}

export interface ReviewPatch {
  text?: string;
  autoRank?: number;
  extractedTags?: string[];
}

export interface ReviewRecord {
  id: string;
  gameName: string;
  text: string;
  autoRank: number | null;
  extractedTags: string[];
  updatedAt: string | null;
}

// Rows of `games` with source = 'manual'. `metadata` is whatever add_manual_game stored.
export interface ManualGameRecord {
  id: string;
  externalId: string | null;
  name: string;
  metadata: unknown;
}

export interface CachedProfile {
  tagWeights: Record<string, number>;
  computedAt: string;
}

export const GAME_SEARCH_SOURCES = ['all', 'steam', 'manual'] as const;
export type GameSearchSource = (typeof GAME_SEARCH_SOURCES)[number];

export interface GameSearchQuery {
  query: string;
  source: GameSearchSource;
  limit: number;
}

export interface GameSearchHit {
  id: string;
  source: 'steam' | 'manual';
  steamAppId: number | null;
  name: string;
  metadata: unknown;
}

export interface ManualGameInput {
  externalId: string;
  name: string;
  metadata: Record<string, unknown>;
}

export interface ReviewExport {
  id: string;
  text: string;
  autoRank: number | null;
  extractedTags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  /** `null` only if the game row vanished; the review is exported anyway. */
  game: {
    id: string;
    name: string;
    source: 'steam' | 'manual';
    steamAppId: number | null;
    externalId: string | null;
    metadata: unknown;
  } | null;
}
