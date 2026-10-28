import { describe, it, expect } from 'vitest';
import {
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from './support/in-memory.js';
import { createFakeStore, storeDetails } from './support/fake-store.js';
import {
  callTool,
  connectToolsClient,
  parseJson,
} from './support/mcp-client.js';

interface RecommendBody {
  recommendations: { gameName: string; score: number; matchedTags: string[] }[];
}

describe('FASE_2 end to end: review → profile → recommend → edit/delete', () => {
  it('derives a taste profile from reviews and keeps it in step with edits and deletions', async () => {
    const backend = createInMemoryBackend();
    const store = createFakeStore({
      search: {
        metroidvania: [
          { appId: 1, name: 'Ori Like', priceUSD: 19.99 },
          { appId: 2, name: 'Axiom Like', priceUSD: 9.99 },
        ],
        'souls like': [{ appId: 3, name: 'Salt Like', priceUSD: 29.99 }],
        platformer: [{ appId: 4, name: 'Celeste Like', priceUSD: 19.99 }],
      },
      details: {
        1: storeDetails(1, {
          name: 'Ori Like',
          genres: ['Metroidvania', 'Platformer'],
        }),
        2: storeDetails(2, {
          name: 'Axiom Like',
          genres: ['Metroidvania'],
          priceUSD: 9.99,
        }),
        3: storeDetails(3, {
          name: 'Salt Like',
          genres: ['Souls-like'],
          priceUSD: 29.99,
        }),
        4: storeDetails(4, { name: 'Celeste Like', genres: ['Platformer'] }),
      },
    });
    const client = await connectToolsClient(
      createTestServices(backend, createFakeSteam(sampleSteamGames()), {
        store,
      }),
    );
    await callTool(client, 'sync_library');

    const hollow = await callTool(client, 'review_game', {
      gameName: 'Hollow Knight',
      text: 'Masterpiece',
      autoRank: 95,
      extractedTags: ['metroidvania', 'souls-like'],
    });
    const portal = await callTool(client, 'review_game', {
      gameName: 'Portal 2',
      text: 'Fun platformer-ish puzzles',
      autoRank: 60,
      extractedTags: ['platformer'],
    });
    const hollowId = parseJson<{ reviewId: string }>(hollow).reviewId;
    const portalId = parseJson<{ reviewId: string }>(portal).reviewId;

    // 2 reviews → metroidvania 47.5, souls like 47.5, platformer 30
    expect(backend.state.profileCache.current?.tagWeights).toEqual({
      metroidvania: 47.5,
      'souls like': 47.5,
      platformer: 30,
    });

    const first = parseJson<RecommendBody>(
      await callTool(client, 'recommend_purchase', { limit: 3 }),
    );
    expect(
      first.recommendations.map(({ gameName, score }) => [gameName, score]),
    ).toEqual([
      ['Ori Like', 100], // 47.5 + 30 = 77.5
      ['Axiom Like', 61], // 47.5
      ['Salt Like', 61], // 47.5
    ]);
    expect(first.recommendations[0]?.matchedTags).toEqual([
      'metroidvania',
      'platformer',
    ]);

    // Re-rank the platformer review to 100: Ori Like pulls further ahead.
    await callTool(client, 'edit_review', {
      reviewId: portalId,
      autoRank: 100,
    });
    expect(backend.state.profileCache.current?.tagWeights.platformer).toBe(50);

    // Drop the Hollow Knight review: one review left (rank 100), so platformer weighs 100 / 1.
    await callTool(client, 'delete_review', { reviewId: hollowId });
    expect(backend.state.profileCache.current?.tagWeights).toEqual({
      platformer: 100,
    });
    const second = parseJson<RecommendBody>(
      await callTool(client, 'recommend_purchase', {}),
    );
    // Only "platformer" is searched now, so only its hits are candidates.
    expect(second.recommendations.map(({ gameName }) => gameName)).toEqual([
      'Celeste Like',
    ]);

    // Deleting the reviewed game removes the last review: nothing left to recommend from.
    const portalGameId = [...backend.state.games.values()].find(
      ({ name }) => name === 'Portal 2',
    )!.id;
    await callTool(client, 'delete_game', { gameId: portalGameId });
    const empty = await callTool(client, 'recommend_purchase', {});
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain('No tagged reviews yet');
  });
});
