import { describe, it, expect } from 'vitest';
import { err, ok } from '@common/result.js';
import {
  DB_FAILURE,
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';
import {
  callTool,
  connectToolsClient,
  parseJson,
} from '../../__tests__/support/mcp-client.js';

async function setup() {
  const backend = createInMemoryBackend();
  await backend.games.upsertSteamGames(
    sampleSteamGames().map(({ appId, name }) => ({
      steamAppId: appId,
      name,
    })),
  );
  const client = await connectToolsClient(
    createTestServices(backend, createFakeSteam([])),
  );

  return { backend, client };
}

describe('review_game tool', () => {
  it('saves the review and returns its id', async () => {
    const { backend, client } = await setup();
    const outcome = await callTool(client, 'review_game', {
      gameName: 'hollow knight',
      text: 'Masterpiece',
      autoRank: 95,
      extractedTags: ['metroidvania', 'souls-like'],
    });

    expect(outcome.isError).toBe(false);
    expect(parseJson(outcome)).toEqual({
      reviewId: backend.state.reviews[0]?.id,
      gameName: 'Hollow Knight',
      textLength: 11,
      autoRank: 95,
    });
    expect(backend.state.reviews[0]).toMatchObject({
      text: 'Masterpiece',
      autoRank: 95,
      extractedTags: ['metroidvania', 'souls-like'],
    });
  });

  it('leaves rank null and tags empty when the user gives none', async () => {
    const { backend, client } = await setup();
    const outcome = await callTool(client, 'review_game', {
      gameName: 'Portal 2',
      text: 'Great co-op',
    });

    expect(parseJson(outcome)).toMatchObject({ autoRank: null });
    expect(backend.state.reviews[0]).toMatchObject({
      autoRank: null,
      extractedTags: [],
    });
  });

  it('creates a new review on every call (not idempotent)', async () => {
    const { backend, client } = await setup();
    await callTool(client, 'review_game', {
      gameName: 'Portal 2',
      text: 'One',
    });
    await callTool(client, 'review_game', {
      gameName: 'Portal 2',
      text: 'Two',
    });

    expect(backend.state.reviews).toHaveLength(2);
  });

  it('guides the user when the game is not in the catalog', async () => {
    const { backend, client } = await setup();
    const outcome = await callTool(client, 'review_game', {
      gameName: 'Elden Ring',
      text: 'Hard',
    });

    expect(outcome).toEqual({
      isError: true,
      text: 'Error: Game "Elden Ring" not found. Run sync_library first or use add_manual_game',
    });
    expect(backend.state.reviews).toHaveLength(0);
  });

  it('refuses an ambiguous name instead of guessing', async () => {
    const { backend, client } = await setup();
    const outcome = await callTool(client, 'review_game', {
      gameName: 'counter',
      text: 'Classic',
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('matches several games');
    expect(backend.state.reviews).toHaveLength(0);
  });

  it.each([
    ['rank above 100', { gameName: 'Portal', text: 'x', autoRank: 101 }],
    ['negative rank', { gameName: 'Portal', text: 'x', autoRank: -1 }],
    ['fractional rank', { gameName: 'Portal', text: 'x', autoRank: 9.5 }],
    ['blank text', { gameName: 'Portal', text: '   ' }],
    ['empty game name', { gameName: '', text: 'x' }],
  ])('rejects %s', async (_label, args) => {
    const { backend, client } = await setup();
    const outcome = await callTool(client, 'review_game', args);

    expect(outcome.isError).toBe(true);
    expect(backend.state.reviews).toHaveLength(0);
  });

  it('refreshes the taste profile after saving', async () => {
    const { backend, client } = await setup();
    await callTool(client, 'review_game', {
      gameName: 'Portal 2',
      text: 'Great co-op',
      autoRank: 80,
      extractedTags: ['puzzle'],
    });

    expect(backend.state.profileCache.current?.tagWeights).toEqual({
      puzzle: 80,
    });
  });

  it('still saves the review when the profile cannot be refreshed', async () => {
    const { backend } = await setup();
    const noProfile = await connectToolsClient({
      ...createTestServices(backend, createFakeSteam([])),
      profile: () =>
        err({
          kind: 'config',
          message: 'Missing environment variable(s): USER_ID',
        }),
    });

    const outcome = await callTool(noProfile, 'review_game', {
      gameName: 'Portal 2',
      text: 'x',
    });

    expect(outcome.isError).toBe(false);
    expect(backend.state.reviews).toHaveLength(1);
  });

  it('reports a failed insert', async () => {
    const { backend } = await setup();
    const failing = await connectToolsClient({
      ...createTestServices(backend, createFakeSteam([])),
      reviews: () =>
        ok({ ...backend.reviews, insert: async () => err(DB_FAILURE) }),
    });

    const outcome = await callTool(failing, 'review_game', {
      gameName: 'Portal 2',
      text: 'x',
    });

    expect(outcome).toEqual({
      isError: true,
      text: 'Error: Could not save the review: connection reset',
    });
  });
});
