import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';
import {
  createFakeStore,
  storeDetails,
} from '../../__tests__/support/fake-store.js';
import {
  callTool,
  connectToolsClient,
  parseJson,
} from '../../__tests__/support/mcp-client.js';
import { syncLibrary } from '@services/library-sync.js';

interface RecommendBody {
  recommendations: {
    gameName: string;
    steamAppId: number | null;
    score: number;
    matchedTags: string[];
    priceUSD: number | null;
    storeUrl: string | null;
  }[];
  evaluated: number;
  skipped: number;
  warnings: string[];
}

async function connect(withReviews: boolean): Promise<Client> {
  const backend = createInMemoryBackend();
  await syncLibrary({
    steam: createFakeSteam(sampleSteamGames()),
    games: backend.games,
    library: backend.library,
  });
  const store = createFakeStore({
    search: {
      metroidvania: [
        { appId: 367520, name: 'Hollow Knight', priceUSD: 7.49 },
        { appId: 1, name: 'Ori Like', priceUSD: 19.99 },
      ],
    },
    details: {
      1: storeDetails(1, {
        name: 'Ori Like',
        priceUSD: 19.99,
        genres: ['Metroidvania'],
        storeUrl: 'https://store.steampowered.com/app/1',
      }),
    },
  });
  const client = await connectToolsClient(
    createTestServices(backend, createFakeSteam([]), { store }),
  );
  if (withReviews) {
    await callTool(client, 'review_game', {
      gameName: 'Hollow Knight',
      text: 'Masterpiece',
      autoRank: 95,
      extractedTags: ['metroidvania'],
    });
  }
  return client;
}

async function setup() {
  const client = await connect(true);

  return { client };
}

describe('recommend_purchase tool', () => {
  it('is read-only, idempotent and open-world', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();

    expect(
      tools.find(({ name }) => name === 'recommend_purchase')?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('recommends unowned games that match the profile', async () => {
    const { client } = await setup();
    const outcome = await callTool(client, 'recommend_purchase', {});

    expect(outcome.isError).toBe(false);
    expect(parseJson<RecommendBody>(outcome)).toEqual({
      recommendations: [
        {
          gameName: 'Ori Like',
          steamAppId: 1,
          score: 100,
          matchedTags: ['metroidvania'],
          priceUSD: 19.99,
          storeUrl: 'https://store.steampowered.com/app/1',
        },
      ],
      evaluated: 1,
      skipped: 0,
      warnings: [],
    });
  });

  it('applies maxPrice', async () => {
    const { client } = await setup();
    const outcome = await callTool(client, 'recommend_purchase', {
      maxPrice: 10,
    });

    expect(parseJson<RecommendBody>(outcome).recommendations).toEqual([]);
  });

  it('asks for tagged reviews when there is no profile', async () => {
    const empty = await connect(false);

    const outcome = await callTool(empty, 'recommend_purchase', {});

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('No tagged reviews yet');
  });

  it.each([
    ['limit 0', { limit: 0 }],
    ['limit 26', { limit: 26 }],
    ['negative price', { maxPrice: -1 }],
    ['blank criteria', { criteria: '  ' }],
  ])('rejects %s', async (_label, args) => {
    const { client } = await setup();
    const outcome = await callTool(client, 'recommend_purchase', args);

    expect(outcome.isError).toBe(true);
  });
});
