import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import {
  DB_FAILURE,
  TEST_NOW,
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';
import type { InMemoryBackend } from '../../__tests__/support/in-memory.js';
import {
  callTool,
  connectToolsClient,
  parseJson,
} from '../../__tests__/support/mcp-client.js';

const UNKNOWN_ID = 'aaaaaaaa-0000-4000-8000-000000000000';

const gameIdOf = (backend: InMemoryBackend, name: string) =>
  [...backend.state.games.values()].find((game) => game.name === name)!.id;

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
  const first = await callTool(client, 'review_game', {
    gameName: 'Hollow Knight',
    text: 'Masterpiece',
    autoRank: 95,
    extractedTags: ['metroidvania'],
  });
  const second = await callTool(client, 'review_game', {
    gameName: 'Portal 2',
    text: 'Great co-op',
    autoRank: 80,
    extractedTags: ['puzzle'],
  });
  const reviewId = parseJson<{ reviewId: string }>(first).reviewId;
  const otherReviewId = parseJson<{ reviewId: string }>(second).reviewId;

  return { backend, client, reviewId, otherReviewId };
}

describe('review management tools', () => {
  describe('edit_review', () => {
    it('changes only the given fields and stamps updated_at', async () => {
      const { backend, client, reviewId } = await setup();
      const outcome = await callTool(client, 'edit_review', {
        reviewId,
        autoRank: 99,
      });

      expect(outcome.isError).toBe(false);
      expect(parseJson(outcome)).toEqual({
        reviewId,
        gameName: 'Hollow Knight',
        textLength: 11,
        autoRank: 99,
        extractedTags: ['metroidvania'],
        updatedAt: TEST_NOW.toISOString(),
      });
      expect(
        backend.state.reviews.find(({ id }) => id === reviewId),
      ).toMatchObject({
        text: 'Masterpiece',
        autoRank: 99,
      });
    });

    it('replaces text and tags', async () => {
      const { backend, client, reviewId } = await setup();
      await callTool(client, 'edit_review', {
        reviewId,
        text: 'Even better on replay',
        extractedTags: ['metroidvania', 'souls-like'],
      });

      expect(
        backend.state.reviews.find(({ id }) => id === reviewId),
      ).toMatchObject({
        text: 'Even better on replay',
        extractedTags: ['metroidvania', 'souls-like'],
      });
    });

    it('is idempotent: the same edit twice leaves the same state', async () => {
      const { client, reviewId } = await setup();
      const args = { reviewId, text: 'Same', autoRank: 70 };
      const first = await callTool(client, 'edit_review', args);
      const second = await callTool(client, 'edit_review', args);

      expect(second).toEqual(first);
    });

    it('recomputes the taste profile', async () => {
      const { backend, client, reviewId } = await setup();
      await callTool(client, 'edit_review', { reviewId, autoRank: 40 });

      // 2 reviews: metroidvania 40/2, puzzle 80/2
      expect(backend.state.profileCache.current?.tagWeights).toEqual({
        puzzle: 40,
        metroidvania: 20,
      });
    });

    it('refuses an edit with nothing to change', async () => {
      const { client, reviewId } = await setup();
      const outcome = await callTool(client, 'edit_review', { reviewId });

      expect(outcome).toEqual({
        isError: true,
        text: 'Error: Nothing to update: provide text, autoRank or extractedTags',
      });
    });

    it('reports an unknown review', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'edit_review', {
        reviewId: UNKNOWN_ID,
        text: 'x',
      });

      expect(outcome).toEqual({
        isError: true,
        text: `Error: Review ${UNKNOWN_ID} not found`,
      });
    });

    it('cannot edit a deleted review', async () => {
      const { client, reviewId } = await setup();
      await callTool(client, 'delete_review', { reviewId });

      const outcome = await callTool(client, 'edit_review', {
        reviewId,
        text: 'x',
      });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toContain('not found');
    });

    it.each([
      ['a non-UUID id', { reviewId: 'abc', text: 'x' }],
      ['rank 101', { reviewId: UNKNOWN_ID, autoRank: 101 }],
      ['blank text', { reviewId: UNKNOWN_ID, text: '  ' }],
    ])('rejects %s', async (_label, args) => {
      const { client } = await setup();
      const outcome = await callTool(client, 'edit_review', args);

      expect(outcome.isError).toBe(true);
    });

    it('reports a database failure', async () => {
      const { backend, reviewId } = await setup();
      const failing = await connectToolsClient({
        ...createTestServices(backend, createFakeSteam([])),
        reviews: () => ({
          ok: true,
          value: { ...backend.reviews, update: async () => err(DB_FAILURE) },
        }),
      });

      const outcome = await callTool(failing, 'edit_review', {
        reviewId,
        text: 'x',
      });

      expect(outcome.text).toBe(
        'Error: Could not update the review: connection reset',
      );
    });

    it('is advertised as non-destructive and idempotent', async () => {
      const { client } = await setup();
      const { tools } = await client.listTools();

      expect(
        tools.find(({ name }) => name === 'edit_review')?.annotations,
      ).toMatchObject({
        destructiveHint: false,
        idempotentHint: true,
      });
    });
  });

  describe('delete_review', () => {
    it('soft-deletes the review and drops it from the profile', async () => {
      const { backend, client, reviewId } = await setup();
      const outcome = await callTool(client, 'delete_review', { reviewId });

      expect(parseJson(outcome)).toEqual({ reviewId, deleted: true });
      expect(
        backend.state.reviews.find(({ id }) => id === reviewId)?.deletedAt,
      ).toBe(TEST_NOW.toISOString());
      expect(backend.state.profileCache.current?.tagWeights).toEqual({
        puzzle: 80,
      });
    });

    it('leaves the other reviews alone', async () => {
      const { backend, client, reviewId, otherReviewId } = await setup();
      await callTool(client, 'delete_review', { reviewId });

      expect(
        backend.state.reviews.find(({ id }) => id === otherReviewId)?.deletedAt,
      ).toBeNull();
    });

    it('is not idempotent: deleting twice reports the second as not found', async () => {
      const { client, reviewId } = await setup();
      await callTool(client, 'delete_review', { reviewId });

      const second = await callTool(client, 'delete_review', { reviewId });

      expect(second).toEqual({
        isError: true,
        text: `Error: Review ${reviewId} not found or already deleted`,
      });
    });

    it('rejects a non-UUID id', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'delete_review', {
        reviewId: '1',
      });

      expect(outcome.isError).toBe(true);
    });

    it('is advertised as destructive and non-idempotent', async () => {
      const { client } = await setup();
      const { tools } = await client.listTools();

      expect(
        tools.find(({ name }) => name === 'delete_review')?.annotations,
      ).toMatchObject({
        destructiveHint: true,
        idempotentHint: false,
      });
    });
  });

  describe('delete_game', () => {
    it('removes the game with its library entry and reviews, and updates the profile', async () => {
      const { backend, client, otherReviewId } = await setup();
      const hollowKnightId = gameIdOf(backend, 'Hollow Knight');
      await backend.library.upsertEntries([
        { gameId: hollowKnightId, playtimeMinutes: 60, lastPlayed: null },
      ]);

      const outcome = await callTool(client, 'delete_game', {
        gameId: hollowKnightId,
      });

      expect(parseJson(outcome)).toEqual({
        deleted: true,
        gameId: hollowKnightId,
        gameName: 'Hollow Knight',
      });
      expect(backend.state.games.has(hollowKnightId)).toBe(false);
      expect(backend.state.library.has(hollowKnightId)).toBe(false);
      expect(backend.state.reviews.map(({ id }) => id)).toEqual([
        otherReviewId,
      ]);
      expect(backend.state.profileCache.current?.tagWeights).toEqual({
        puzzle: 80,
      });
    });

    it('reports an unknown game', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'delete_game', {
        gameId: UNKNOWN_ID,
      });

      expect(outcome).toEqual({
        isError: true,
        text: `Error: Game ${UNKNOWN_ID} not found`,
      });
    });

    it('rejects a non-UUID id', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'delete_game', {
        gameId: '367520',
      });

      expect(outcome.isError).toBe(true);
    });

    it('is destructive and tells the client to ask for confirmation', async () => {
      const { client } = await setup();
      const { tools } = await client.listTools();
      const tool = tools.find(({ name }) => name === 'delete_game');

      expect(tool?.annotations).toMatchObject({ destructiveHint: true });
      expect(tool?.description).toContain('ALWAYS ask the user to confirm');
    });
  });
});
