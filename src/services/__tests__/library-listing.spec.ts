import { describe, it, expect } from 'vitest';
import type { LibraryItem } from '@db/index.js';
import { sortLibrary } from '../library-listing.js';

const item = (
  name: string,
  playtimeMinutes: number,
  lastPlayed: string | null,
): LibraryItem => ({
  gameId: name,
  name,
  steamAppId: null,
  playtimeMinutes,
  lastPlayed,
});

const items = [
  item('Portal', 240, '2022-05-05T08:30:00+00:00'),
  item('Hollow Knight', 3120, '2023-11-14T22:13:20+00:00'),
  item('Counter-Strike', 0, null),
  item('Portal 2', 600, '2024-02-01T10:00:00+00:00'),
  item('Antichamber', 0, null),
];

const names = (sorted: LibraryItem[]) => sorted.map(({ name }) => name);

describe('sortLibrary', () => {
  it('sorts by name ascending', () => {
    expect(names(sortLibrary(items, 'name'))).toEqual([
      'Antichamber',
      'Counter-Strike',
      'Hollow Knight',
      'Portal',
      'Portal 2',
    ]);
  });

  it('sorts by playtime descending, ties by name', () => {
    expect(names(sortLibrary(items, 'playtime'))).toEqual([
      'Hollow Knight',
      'Portal 2',
      'Portal',
      'Antichamber',
      'Counter-Strike',
    ]);
  });

  it('sorts by last played descending with never-played last', () => {
    expect(names(sortLibrary(items, 'lastPlayed'))).toEqual([
      'Portal 2',
      'Hollow Knight',
      'Portal',
      'Antichamber',
      'Counter-Strike',
    ]);
  });

  it('does not mutate its input', () => {
    const before = names(items);
    sortLibrary(items, 'playtime');
    expect(names(items)).toEqual(before);
  });
});
