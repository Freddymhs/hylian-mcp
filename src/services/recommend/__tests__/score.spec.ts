import { describe, it, expect } from 'vitest';
import type { Game } from '@providers/index.js';
import { scoreCandidates } from '../score.js';

const game = (
  name: string,
  tags: string[],
  steamAppId: number | null = null,
): Game => ({
  source: 'steam',
  externalId: String(steamAppId ?? name),
  steamAppId,
  name,
  tags,
  priceUSD: 19.99,
  storeUrl: null,
  description: '',
  detailed: true,
});

const TAG_WEIGHTS = {
  metroidvania: 30,
  'souls like': 20,
  indie: 10,
  platformer: 5,
};
const NOTHING_OWNED = {
  steamAppIds: new Set<number>(),
  names: new Set<string>(),
};

describe('scoreCandidates', () => {
  const candidates = [
    game('Platform Only', ['platformer', 'indie'], 3),
    game('Hollow-like', ['indie', 'souls like', 'metroidvania'], 1),
    game('Metroidvania Lite', ['metroidvania', 'platformer'], 2),
    game('Shooter', ['shooter'], 4),
  ];

  it('ranks by the summed weight of the matched profile tags', () => {
    const result = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates,
      owned: NOTHING_OWNED,
      limit: 10,
    });

    expect(result.map(({ game: { name }, score }) => [name, score])).toEqual([
      ['Hollow-like', 100], // 60 → best of the run
      ['Metroidvania Lite', 58], // 35 / 60
      ['Platform Only', 25], // 15 / 60
    ]);
  });

  it('lists matched tags heaviest first and ignores tags outside the profile', () => {
    const [top] = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates: [game('X', ['indie', 'open world', 'metroidvania'], 9)],
      owned: NOTHING_OWNED,
      limit: 10,
    });

    expect(top?.matchedTags).toEqual(['metroidvania', 'indie']);
  });

  it('never recommends a game with no tag in common', () => {
    const result = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates,
      owned: NOTHING_OWNED,
      limit: 10,
    });

    expect(result.map(({ game: { name } }) => name)).not.toContain('Shooter');
  });

  it('discards games already in the library, by appid or by name', () => {
    const result = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates,
      owned: {
        steamAppIds: new Set([1]),
        names: new Set(['metroidvania lite']),
      },
      limit: 10,
    });

    expect(result.map(({ game: { name } }) => name)).toEqual(['Platform Only']);
    expect(result[0]?.score).toBe(100);
  });

  it('returns only the top N', () => {
    const result = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates,
      owned: NOTHING_OWNED,
      limit: 1,
    });

    expect(result.map(({ game: { name } }) => name)).toEqual(['Hollow-like']);
  });

  it('breaks ties by name', () => {
    const result = scoreCandidates({
      tagWeights: TAG_WEIGHTS,
      candidates: [game('Zeta', ['indie'], 1), game('Alpha', ['indie'], 2)],
      owned: NOTHING_OWNED,
      limit: 10,
    });

    expect(result.map(({ game: { name } }) => name)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns nothing for an empty profile or no candidates', () => {
    expect(
      scoreCandidates({
        tagWeights: {},
        candidates,
        owned: NOTHING_OWNED,
        limit: 5,
      }),
    ).toEqual([]);
    expect(
      scoreCandidates({
        tagWeights: TAG_WEIGHTS,
        candidates: [],
        owned: NOTHING_OWNED,
        limit: 5,
      }),
    ).toEqual([]);
  });
});
