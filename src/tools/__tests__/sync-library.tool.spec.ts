import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import type { Services } from '@services/index.js';
import {
  createFailingSteam,
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

describe('sync_library tool', () => {
  it('is advertised as an idempotent, non-destructive, open-world tool', async () => {
    const backend = createInMemoryBackend();
    const client = await connectToolsClient(
      createTestServices(backend, createFakeSteam([])),
    );

    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === 'sync_library');

    expect(tool?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('syncs and returns the summary', async () => {
    const backend = createInMemoryBackend();
    const client = await connectToolsClient(
      createTestServices(backend, createFakeSteam(sampleSteamGames())),
    );

    const outcome = await callTool(client, 'sync_library');

    expect(outcome.isError).toBe(false);
    expect(parseJson(outcome)).toEqual({
      synced: 5,
      newGames: 5,
      totalPlaytime: 67.5,
    });
  });

  it('turns a Steam failure into a tool error', async () => {
    const backend = createInMemoryBackend();
    const client = await connectToolsClient(
      createTestServices(
        backend,
        createFailingSteam('Steam rejected the request (HTTP 403)'),
      ),
    );

    const outcome = await callTool(client, 'sync_library');

    expect(outcome).toEqual({
      isError: true,
      text: 'Error: Steam error: Steam rejected the request (HTTP 403)',
    });
  });

  it('names the missing variable when Steam is not configured', async () => {
    const backend = createInMemoryBackend();
    const services: Services = {
      ...createTestServices(backend, createFakeSteam([])),
      steam: () =>
        err({
          kind: 'config',
          message: 'Missing environment variable(s): STEAM_API_KEY',
        }),
    };
    const client = await connectToolsClient(services);

    const outcome = await callTool(client, 'sync_library');

    expect(outcome).toEqual({
      isError: true,
      text: 'Error: Missing environment variable(s): STEAM_API_KEY',
    });
  });
});
