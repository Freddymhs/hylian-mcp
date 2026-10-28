import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import type { ReviewTagSample } from '@db/index.js';
import { computeTagWeights } from '../aggregate.js';
import { createProfileService } from '../service.js';
import {
  DB_FAILURE,
  createInMemoryBackend,
} from '../../../__tests__/support/in-memory.js';

const review = (
  autoRank: number | null,
  ...extractedTags: string[]
): ReviewTagSample => ({ autoRank, extractedTags });

// 6 reviews → every tag sum is divided by 6.
const REVIEWS = [
  review(95, 'metroidvania', 'souls-like', 'indie'),
  review(90, 'Metroidvania', 'platformer'),
  review(80, 'Souls Like', 'action rpg'),
  review(null, 'indie', 'platformer'),
  review(40, 'shooter'),
  review(70),
];

describe('computeTagWeights', () => {
  it('weights each tag by the ranks of its reviews over ALL reviews', () => {
    expect(computeTagWeights(REVIEWS)).toEqual({
      metroidvania: 30.83, // (95 + 90) / 6
      'souls like': 29.17, // (95 + 80) / 6
      indie: 24.17, // (95 + 50) / 6 — unranked review counts as 50
      platformer: 23.33, // (90 + 50) / 6
      'action rpg': 13.33, // 80 / 6
      shooter: 6.67, // 40 / 6
    });
  });

  it('orders tags from heaviest to lightest', () => {
    expect(Object.keys(computeTagWeights(REVIEWS))[0]).toBe('metroidvania');
  });

  it('counts a tag repeated inside one review once', () => {
    expect(computeTagWeights([review(80, 'rpg', 'RPG', 'rpg')])).toEqual({
      rpg: 80,
    });
  });

  it('treats a rank of 0 as 0, not as unranked', () => {
    expect(computeTagWeights([review(0, 'bad'), review(100, 'good')])).toEqual({
      good: 50,
      bad: 0,
    });
  });

  it('returns an empty profile without reviews', () => {
    expect(computeTagWeights([])).toEqual({});
  });
});

describe('profile service', () => {
  const START = new Date('2026-10-24T12:00:00.000Z');
  const HOUR_MS = 60 * 60 * 1000;

  const buildService = (clockNow: { current: Date }) => {
    const backend = createInMemoryBackend();
    const service = createProfileService({
      reviews: backend.reviews,
      profile: backend.profile,
      clock: () => clockNow.current,
    });
    return { backend, service };
  };

  const addReview = (
    backend: ReturnType<typeof createInMemoryBackend>,
    autoRank: number | null,
    ...extractedTags: string[]
  ) =>
    backend.reviews.insert({ gameId: 'g', text: 't', autoRank, extractedTags });

  it('computes and caches the profile on first use', async () => {
    const { backend, service } = buildService({ current: START });
    await addReview(backend, 100, 'rpg');

    const result = await service.get();

    expect(result).toEqual({
      ok: true,
      value: {
        tagWeights: { rpg: 100 },
        computedAt: START.toISOString(),
        fromCache: false,
      },
    });
    expect(backend.state.profileCache.current).toEqual({
      tagWeights: { rpg: 100 },
      computedAt: START.toISOString(),
    });
  });

  it('serves the cache for 24 h even if reviews changed', async () => {
    const clock = { current: START };
    const { backend, service } = buildService(clock);
    await addReview(backend, 100, 'rpg');
    await service.get();
    await addReview(backend, 100, 'platformer');
    clock.current = new Date(START.getTime() + 23 * HOUR_MS);

    const result = await service.get();

    expect(result).toMatchObject({
      ok: true,
      value: { tagWeights: { rpg: 100 }, fromCache: true },
    });
  });

  it('recomputes once the cache is 24 h old', async () => {
    const clock = { current: START };
    const { backend, service } = buildService(clock);
    await addReview(backend, 100, 'rpg');
    await service.get();
    await addReview(backend, 100, 'platformer');
    clock.current = new Date(START.getTime() + 24 * HOUR_MS);

    const result = await service.get();

    expect(result).toMatchObject({
      ok: true,
      value: { tagWeights: { rpg: 50, platformer: 50 }, fromCache: false },
    });
  });

  it('recomputes on demand with force', async () => {
    const { backend, service } = buildService({ current: START });
    await addReview(backend, 100, 'rpg');
    await service.get();
    await addReview(backend, 100, 'platformer');

    const result = await service.get({ force: true });

    expect(result).toMatchObject({
      ok: true,
      value: { tagWeights: { rpg: 50, platformer: 50 }, fromCache: false },
    });
  });

  it('ignores soft-deleted reviews', async () => {
    const { backend, service } = buildService({ current: START });
    const inserted = await addReview(backend, 100, 'rpg');
    await addReview(backend, 100, 'platformer');
    if (inserted.ok) {
      await backend.reviews.softDelete(inserted.value.id, START);
    }

    const result = await service.get();

    expect(result).toMatchObject({
      ok: true,
      value: { tagWeights: { platformer: 100 } },
    });
  });

  it('refreshQuietly swallows failures instead of throwing', async () => {
    const backend = createInMemoryBackend();
    const service = createProfileService({
      reviews: {
        ...backend.reviews,
        listTagSamples: async () => err(DB_FAILURE),
      },
      profile: backend.profile,
    });

    await expect(service.refreshQuietly()).resolves.toBeUndefined();
  });

  it('reports a failure to read reviews', async () => {
    const backend = createInMemoryBackend();
    const service = createProfileService({
      reviews: {
        ...backend.reviews,
        listTagSamples: async () => err(DB_FAILURE),
      },
      profile: backend.profile,
    });

    const result = await service.get();

    expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
  });
});
