import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
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
import { syncLibrary } from '@services/library-sync.js';

interface RankBody {
  ranked: { name: string; score: number; matchedTags: string[] }[];
  unmatched: string[];
}

const CANDIDATES = [
  { name: 'Racing Port', tags: ['Racing', 'Arcade'] },
  { name: 'Shooter Port', tags: ['FPS', 'Horror'] },
  { name: 'Zombie Port', tags: ['horror'] },
];

async function connect(withReviews: boolean): Promise<Client> {
  const backend = createInMemoryBackend();
  await syncLibrary({
    steam: createFakeSteam(sampleSteamGames()),
    games: backend.games,
    library: backend.library,
  });
  const client = await connectToolsClient(
    createTestServices(backend, createFakeSteam([])),
  );
  if (withReviews) {
    await callTool(client, 'review_game', {
      gameName: 'Hollow Knight',
      text: 'Tense and dark',
      autoRank: 90,
      extractedTags: ['fps', 'horror'],
    });
  }
  return client;
}

async function setup() {
  const client = await connect(true);

  return { client };
}

describe('rank_games tool', () => {
  it('is read-only, idempotent and closed-world', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();

    expect(
      tools.find(({ name }) => name === 'rank_games')?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('ranks the given games against the profile and lists the ones with no shared tag', async () => {
    const { client } = await setup();
    const outcome = await callTool(client, 'rank_games', {
      games: CANDIDATES,
    });

    expect(outcome.isError).toBe(false);
    expect(parseJson<RankBody>(outcome)).toEqual({
      ranked: [
        { name: 'Shooter Port', score: 100, matchedTags: ['fps', 'horror'] },
        { name: 'Zombie Port', score: 50, matchedTags: ['horror'] },
      ],
      unmatched: ['Racing Port'],
    });
  });

  it('asks for tagged reviews when there is no profile', async () => {
    const empty = await connect(false);

    const outcome = await callTool(empty, 'rank_games', {
      games: CANDIDATES,
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('No tagged reviews yet');
  });

  it.each([
    ['an empty list', { games: [] }],
    ['a game without tags', { games: [{ name: 'X', tags: [] }] }],
    ['a blank name', { games: [{ name: '  ', tags: ['fps'] }] }],
  ])('rejects %s', async (_label, args) => {
    const { client } = await setup();
    const outcome = await callTool(client, 'rank_games', args);

    expect(outcome.isError).toBe(true);
  });
});
