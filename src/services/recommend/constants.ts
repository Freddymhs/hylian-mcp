export const DEFAULT_RECOMMENDATIONS = 10;
export const MAX_RECOMMENDATIONS = 25;
export const MAX_SCORE = 100;

export const NO_PROFILE_MESSAGE =
  'No tagged reviews yet: write reviews with review_game (including extractedTags) so a taste profile can be built';

// Steam Store API is unofficial and rate limited: keep the fan-out bounded.
export const SEARCH_TERMS_FROM_PROFILE = 5;
export const MAX_DETAIL_CANDIDATES = 24;
export const DETAIL_CONCURRENCY = 4;
