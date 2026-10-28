import { describe, it, expect } from 'vitest';
import { syncLibrary } from '@services/library-sync.js';
import {
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

interface ListBody {
  total: number;
  returned: number;
  games: { name: string; playtimeHours: number; lastPlayed: string | null }[];
}

async function setup() {
  const backend = createInMemoryBackend();
  await syncLibrary({
    steam: createFakeSteam(sampleSteamGames()),
    games: backend.games,
    library: backend.library,
  });
  const client = await connectToolsClient(
    createTestServices(backend, createFakeSteam([])),
  );
  const list = async (args: Record<string, unknown> = {}) =>
    parseJson<ListBody>(await callTool(client, 'list_my_games', args));

  return { client, list };
}

describe('list_my_games tool', () => {
  it('is read-only and idempotent', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === 'list_my_games');

    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('lists everything by name by default', async () => {
    const { list } = await setup();
    const body = await list();

    expect(body.total).toBe(5);
    expect(body.games.map(({ name }) => name)).toEqual([
      'Counter-Strike',
      'Counter-Strike 2',
      'Hollow Knight',
      'Portal',
      'Portal 2',
    ]);
  });

  it('filters played games and converts minutes to hours', async () => {
    const { list } = await setup();
    const body = await list({ filter: 'played', sortBy: 'playtime' });

    expect(
      body.games.map(({ name, playtimeHours }) => [name, playtimeHours]),
    ).toEqual([
      ['Hollow Knight', 52],
      ['Portal 2', 10],
      ['Portal', 4],
      ['Counter-Strike 2', 1.5],
    ]);
  });

  it('filters unplayed games', async () => {
    const { list } = await setup();
    const body = await list({ filter: 'unplayed' });

    expect(body.games.map(({ name }) => name)).toEqual(['Counter-Strike']);
  });

  it('sorts by last played, most recent first', async () => {
    const { list } = await setup();
    const body = await list({ sortBy: 'lastPlayed' });

    expect(body.games.slice(0, 3).map(({ name }) => name)).toEqual([
      'Portal 2',
      'Hollow Knight',
      'Portal',
    ]);
  });

  it('caps the result with limit but still reports the total', async () => {
    const { list } = await setup();
    const body = await list({ limit: 2 });

    expect(body).toMatchObject({ total: 5, returned: 2 });
    expect(body.games).toHaveLength(2);
  });

  it.each([
    ['unknown filter', { filter: 'favorites' }],
    ['unknown sort', { sortBy: 'price' }],
    ['limit of zero', { limit: 0 }],
  ])('rejects %s', async (_label, args) => {
    const { client } = await setup();
    const outcome = await callTool(client, 'list_my_games', args);

    expect(outcome.isError).toBe(true);
  });
});
