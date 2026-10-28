import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
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

interface SearchBody {
  returned: number;
  games: {
    gameId: string;
    name: string;
    source: string;
    steamAppId: number | null;
    tags: string[];
  }[];
}

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
  const search = async (args: Record<string, unknown>) =>
    parseJson<SearchBody>(await callTool(client, 'search_games', args));

  return { backend, client, search };
}

// The search specs run against a catalog that already holds one manual game.
async function setupWithTunic() {
  const context = await setup();
  await callTool(context.client, 'add_manual_game', {
    name: 'Tunic (Switch)',
    metadata: { genres: ['adventure'], tags: ['Zelda-like'] },
  });
  return context;
}

describe('catalog tools', () => {
  describe('add_manual_game', () => {
    it('stores a manual game with the user-supplied metadata', async () => {
      const { backend, client } = await setup();
      const outcome = await callTool(client, 'add_manual_game', {
        name: 'Tunic (Switch)',
        metadata: {
          genres: ['adventure'],
          tags: ['zelda-like'],
          releaseYear: 2022,
          developer: 'Andrew Shouldice',
        },
      });

      const body = parseJson<{ gameId: string; externalId: string }>(outcome);
      expect(outcome.isError).toBe(false);
      expect(body).toMatchObject({ name: 'Tunic (Switch)', source: 'manual' });
      expect(backend.state.games.get(body.gameId)).toMatchObject({
        source: 'manual',
        steamAppId: null,
        externalId: body.externalId,
        metadata: {
          genres: ['adventure'],
          tags: ['zelda-like'],
          releaseYear: 2022,
          developer: 'Andrew Shouldice',
          priceUSD: null,
          description: '',
          storeUrl: null,
        },
      });
    });

    it('works without metadata', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'add_manual_game', {
        name: 'Mystery Cartridge',
      });

      expect(outcome.isError).toBe(false);
    });

    it('creates a new row on every call with a distinct name (not idempotent)', async () => {
      const { backend, client } = await setup();
      await callTool(client, 'add_manual_game', { name: 'A' });
      await callTool(client, 'add_manual_game', { name: 'B' });

      const manual = [...backend.state.games.values()].filter(
        ({ source }) => source === 'manual',
      );
      expect(manual).toHaveLength(2);
    });

    it.each([
      ['a manual game', 'tunic', 'Tunic'],
      ['a Steam game', 'hollow knight', 'Hollow Knight'],
    ])('refuses a name that already exists as %s', async (_label, name) => {
      const { client } = await setup();
      await callTool(client, 'add_manual_game', { name: 'Tunic' });

      const outcome = await callTool(client, 'add_manual_game', { name });

      expect(outcome.isError).toBe(true);
      expect(outcome.text).toContain('already exists');
    });

    it('accepts a longer name that merely contains an existing one', async () => {
      const { client } = await setup();
      const outcome = await callTool(client, 'add_manual_game', {
        name: 'Portal 2 (Xbox 360)',
      });

      expect(outcome.isError).toBe(false);
    });

    it('makes the new game reviewable by name', async () => {
      const { client } = await setup();
      await callTool(client, 'add_manual_game', { name: 'Tunic (Switch)' });

      const review = await callTool(client, 'review_game', {
        gameName: 'tunic',
        text: 'Lovely',
      });

      expect(review.isError).toBe(false);
      expect(parseJson(review)).toMatchObject({ gameName: 'Tunic (Switch)' });
    });

    it('does not put the game in the library', async () => {
      const { client } = await setup();
      await callTool(client, 'add_manual_game', { name: 'Tunic (Switch)' });

      const listing = await callTool(client, 'list_my_games', {});

      expect(listing.text).not.toContain('Tunic');
    });

    it.each([
      ['empty name', { name: '' }],
      ['year out of range', { name: 'X', metadata: { releaseYear: 1800 } }],
      ['negative price', { name: 'X', metadata: { priceUSD: -1 } }],
      ['invalid store url', { name: 'X', metadata: { storeUrl: 'not a url' } }],
    ])('rejects %s', async (_label, args) => {
      const { client } = await setup();
      const outcome = await callTool(client, 'add_manual_game', args);

      expect(outcome.isError).toBe(true);
    });

    it('reports a database failure', async () => {
      const { backend } = await setup();
      const failing = await connectToolsClient({
        ...createTestServices(backend, createFakeSteam([])),
        games: () => ({
          ok: true,
          value: {
            ...backend.games,
            insertManual: async () => err(DB_FAILURE),
          },
        }),
      });

      const outcome = await callTool(failing, 'add_manual_game', { name: 'X' });

      expect(outcome.text).toBe(
        'Error: Could not add the game: connection reset',
      );
    });

    it('is advertised as non-idempotent', async () => {
      const { client } = await setup();
      const { tools } = await client.listTools();

      expect(
        tools.find(({ name }) => name === 'add_manual_game')?.annotations,
      ).toMatchObject({
        idempotentHint: false,
        destructiveHint: false,
      });
    });
  });

  describe('search_games', () => {
    it('finds a freshly added manual game by name', async () => {
      const { search } = await setupWithTunic();
      const body = await search({ query: 'tunic' });

      expect(body.games.map(({ name }) => name)).toEqual(['Tunic (Switch)']);
      expect(body.games[0]).toMatchObject({
        source: 'manual',
        steamAppId: null,
        tags: ['Zelda-like', 'adventure'],
      });
    });

    it('finds by tag and by genre', async () => {
      const { search } = await setupWithTunic();
      expect((await search({ query: 'zelda' })).games).toHaveLength(1);
      expect((await search({ query: 'adventure' })).games).toHaveLength(1);
    });

    it('is case-insensitive and partial', async () => {
      const { search } = await setupWithTunic();
      const body = await search({ query: 'PORTAL' });

      expect(body.games.map(({ name }) => name)).toEqual([
        'Portal',
        'Portal 2',
      ]);
    });

    it('returns the id that delete_game needs and the steam appid for Steam games', async () => {
      const { search } = await setupWithTunic();
      const body = await search({ query: 'hollow' });

      expect(body.games[0]).toMatchObject({
        name: 'Hollow Knight',
        source: 'steam',
        steamAppId: 367520,
      });
      expect(body.games[0]?.gameId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('restricts by source', async () => {
      const { search } = await setupWithTunic();
      expect(
        (await search({ query: 'a', source: 'manual' })).games.map(
          ({ name }) => name,
        ),
      ).toEqual(['Tunic (Switch)']);
      const steamOnly = await search({ query: 'tunic', source: 'steam' });
      expect(steamOnly.returned).toBe(0);
    });

    it('caps the result with limit', async () => {
      const { search } = await setupWithTunic();
      const body = await search({ query: 'counter', limit: 1 });

      expect(body.returned).toBe(1);
    });

    it('returns an empty list when nothing matches', async () => {
      const { search } = await setupWithTunic();
      const body = await search({ query: 'zzzz' });

      expect(body).toEqual({ returned: 0, games: [] });
    });

    it.each([
      ['empty query', { query: '' }],
      ['unknown source', { query: 'x', source: 'epic' }],
      ['limit 0', { query: 'x', limit: 0 }],
      ['limit 101', { query: 'x', limit: 101 }],
    ])('rejects %s', async (_label, args) => {
      const { client } = await setupWithTunic();
      const outcome = await callTool(client, 'search_games', args);

      expect(outcome.isError).toBe(true);
    });

    it('is read-only', async () => {
      const { client } = await setupWithTunic();
      const { tools } = await client.listTools();

      expect(
        tools.find(({ name }) => name === 'search_games')?.annotations,
      ).toMatchObject({
        readOnlyHint: true,
      });
    });
  });
});
