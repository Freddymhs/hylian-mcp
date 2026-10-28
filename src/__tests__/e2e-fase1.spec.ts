import { describe, it, expect } from 'vitest';
import {
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from './support/in-memory.js';
import {
  callTool,
  connectToolsClient,
  parseJson,
} from './support/mcp-client.js';

describe('FASE_1 end to end: sync → review → list', () => {
  it('runs the whole flow through the MCP protocol', async () => {
    const backend = createInMemoryBackend();
    const client = await connectToolsClient(
      createTestServices(backend, createFakeSteam(sampleSteamGames())),
    );

    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['list_my_games', 'review_game', 'sync_library']),
    );

    const sync = await callTool(client, 'sync_library');
    expect(parseJson(sync)).toEqual({
      synced: 5,
      newGames: 5,
      totalPlaytime: 67.5,
    });

    const review = await callTool(client, 'review_game', {
      gameName: 'Hollow Knight',
      text: 'Masterpiece, 95/100, metroidvania souls-like',
      autoRank: 95,
      extractedTags: ['metroidvania', 'souls-like'],
    });
    expect(
      parseJson<{ reviewId: string; gameName: string }>(review),
    ).toMatchObject({
      gameName: 'Hollow Knight',
      textLength: 44,
      autoRank: 95,
    });
    expect(backend.state.reviews).toHaveLength(1);

    const list = await callTool(client, 'list_my_games', {
      filter: 'played',
      sortBy: 'playtime',
      limit: 2,
    });
    expect(parseJson(list)).toEqual({
      total: 4,
      returned: 2,
      games: [
        {
          gameId: expect.any(String),
          name: 'Hollow Knight',
          steamAppId: 367520,
          playtimeHours: 52,
          lastPlayed: '2023-11-14T22:13:20.000Z',
        },
        {
          gameId: expect.any(String),
          name: 'Portal 2',
          steamAppId: 620,
          playtimeHours: 10,
          lastPlayed: '2024-02-01T10:00:00.000Z',
        },
      ],
    });

    const resync = await callTool(client, 'sync_library');
    expect(parseJson(resync)).toMatchObject({ synced: 5, newGames: 0 });
    expect(backend.state.reviews).toHaveLength(1);
  });
});
