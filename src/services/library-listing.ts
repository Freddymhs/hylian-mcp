import type { LibraryItem } from '@db/index.js';
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from './constants.js';

export const LIBRARY_SORT_KEYS = ['name', 'playtime', 'lastPlayed'] as const;
export type LibrarySortKey = (typeof LIBRARY_SORT_KEYS)[number];

export { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT };

type Comparator = (a: LibraryItem, b: LibraryItem) => number;

const byName: Comparator = (a, b) => a.name.localeCompare(b.name);

// Most played first; ties fall back to name so the order is stable.
const byPlaytime: Comparator = (a, b) =>
  b.playtimeMinutes - a.playtimeMinutes || byName(a, b);

// Most recent first; never-played games (null) go last.
const byLastPlayed: Comparator = (a, b) => {
  if (a.lastPlayed === b.lastPlayed) {
    return byName(a, b);
  }
  if (a.lastPlayed === null) {
    return 1;
  }
  if (b.lastPlayed === null) {
    return -1;
  }
  return Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed);
};

const COMPARATORS: Record<LibrarySortKey, Comparator> = {
  name: byName,
  playtime: byPlaytime,
  lastPlayed: byLastPlayed,
};

export function sortLibrary(
  items: readonly LibraryItem[],
  sortBy: LibrarySortKey,
): LibraryItem[] {
  return [...items].sort(COMPARATORS[sortBy]);
}
