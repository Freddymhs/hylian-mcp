import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import {
  createGameProviderService,
  createManualProvider,
  createSteamProvider,
} from '../index.js';
import {
  DB_FAILURE,
  createInMemoryBackend,
} from '../../__tests__/support/in-memory.js';
import {
  createFakeStore,
  storeDetails,
} from '../../__tests__/support/fake-store.js';

const HOLLOW_KNIGHT_DETAILS = storeDetails(367520, {
  name: 'Hollow Knight',
  priceUSD: 7.49,
  genres: ['Action', 'Indie'],
  categories: ['Single-player', 'Steam Achievements'],
  description: 'Forge your own path.',
});

describe('steam provider', () => {
  it('fetches details and normalizes genres and categories into tags', async () => {
    const provider = createSteamProvider(
      createFakeStore({ details: { 367520: HOLLOW_KNIGHT_DETAILS } }),
    );

    const result = await provider.fetch('367520');

    expect(result).toEqual({
      ok: true,
      value: {
        source: 'steam',
        externalId: '367520',
        steamAppId: 367520,
        name: 'Hollow Knight',
        tags: ['action', 'indie', 'single player', 'steam achievements'],
        priceUSD: 7.49,
        storeUrl: 'https://store.steampowered.com/app/367520',
        description: 'Forge your own path.',
        detailed: true,
      },
    });
  });

  it.each(['abc', '0', '-5', '12.5'])(
    'rejects "%s" as an appid',
    async (id) => {
      const provider = createSteamProvider(createFakeStore());

      const result = await provider.fetch(id);

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'invalid_input' },
      });
    },
  );

  it('reports not_found when the Store has no such game', async () => {
    const provider = createSteamProvider(
      createFakeStore({ details: { 1: null } }),
    );

    const result = await provider.fetch('1');

    expect(result).toMatchObject({ ok: false, error: { kind: 'not_found' } });
  });

  it('reports unavailable when the Store cannot be reached', async () => {
    const provider = createSteamProvider(createFakeStore());

    const result = await provider.fetch('42');

    expect(result).toMatchObject({
      ok: false,
      error: { provider: 'steam', kind: 'unavailable' },
    });
  });

  it('returns lightweight search hits without tags', async () => {
    const provider = createSteamProvider(
      createFakeStore({
        search: {
          metroidvania: [
            { appId: 367520, name: 'Hollow Knight', priceUSD: 7.49 },
          ],
        },
      }),
    );

    const result = await provider.search('metroidvania');

    expect(result).toEqual({
      ok: true,
      value: [
        {
          source: 'steam',
          externalId: '367520',
          steamAppId: 367520,
          name: 'Hollow Knight',
          tags: [],
          priceUSD: 7.49,
          storeUrl: 'https://store.steampowered.com/app/367520',
          description: '',
          detailed: false,
        },
      ],
    });
  });

  it('reports unavailable when the search fails', async () => {
    const provider = createSteamProvider(
      createFakeStore({ searchFails: true }),
    );

    const result = await provider.search('x');

    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });
});

describe('manual provider', () => {
  const seed = () => {
    const backend = createInMemoryBackend();
    backend.addManualGame({
      name: 'Tunic (Switch)',
      externalId: 'tunic-switch',
      metadata: {
        tags: ['Zelda-like', 'Isometric'],
        priceUSD: 29.99,
        description: 'Played on the Switch.',
        storeUrl: 'https://example.invalid/tunic',
      },
    });
    backend.addManualGame({
      name: 'Mystery Cartridge',
      externalId: 'mystery',
      metadata: 'garbage',
    });
    return backend;
  };

  it('fetches a manual game with its user-supplied metadata', async () => {
    const provider = createManualProvider(seed().games);

    const result = await provider.fetch('tunic-switch');

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: 'manual',
        externalId: 'tunic-switch',
        steamAppId: null,
        name: 'Tunic (Switch)',
        tags: ['zelda like', 'isometric'],
        priceUSD: 29.99,
        storeUrl: 'https://example.invalid/tunic',
        detailed: true,
      },
    });
  });

  it('degrades unreadable metadata to an empty game instead of failing', async () => {
    const provider = createManualProvider(seed().games);

    const result = await provider.fetch('mystery');

    expect(result).toMatchObject({
      ok: true,
      value: {
        name: 'Mystery Cartridge',
        tags: [],
        priceUSD: null,
        description: '',
      },
    });
  });

  it('reports not_found for an unknown external id', async () => {
    const provider = createManualProvider(seed().games);

    const result = await provider.fetch('nope');

    expect(result).toMatchObject({ ok: false, error: { kind: 'not_found' } });
  });

  it('searches only manual games by partial name', async () => {
    const backend = seed();
    await backend.games.upsertSteamGames([{ steamAppId: 1, name: 'Tunic' }]);
    const provider = createManualProvider(backend.games);

    const result = await provider.search('tunic');

    expect(result.ok && result.value.map(({ name }) => name)).toEqual([
      'Tunic (Switch)',
    ]);
  });

  it('reports unavailable on a database failure', async () => {
    const backend = seed();
    const provider = createManualProvider({
      ...backend.games,
      searchManual: async () => err(DB_FAILURE),
    });

    const result = await provider.search('x');

    expect(result).toMatchObject({
      ok: false,
      error: { provider: 'manual', kind: 'unavailable' },
    });
  });
});

describe('game provider service', () => {
  const buildService = () => {
    const backend = createInMemoryBackend();
    backend.addManualGame({
      name: 'Hollow Knight',
      externalId: 'hk-physical',
      metadata: { tags: ['metroidvania'], priceUSD: 0 },
    });
    const store = createFakeStore({
      search: {
        knight: [
          { appId: 367520, name: 'Hollow  Knight', priceUSD: 7.49 },
          { appId: 5, name: 'Shovel Knight', priceUSD: 24.99 },
        ],
      },
      details: { 5: storeDetails(5, { name: 'Shovel Knight' }) },
    });
    return createGameProviderService([
      createManualProvider(backend.games),
      createSteamProvider(store),
    ]);
  };

  it('merges providers and dedupes by normalized name, manual first', async () => {
    const result = await buildService().search('knight');

    expect(result.ok).toBe(true);
    const games = result.ok ? result.value.games : [];
    expect(games.map(({ name, source }) => [name, source])).toEqual([
      ['Hollow Knight', 'manual'],
      ['Shovel Knight', 'steam'],
    ]);
  });

  it('returns partial results when one provider fails', async () => {
    const backend = createInMemoryBackend();
    backend.addManualGame({ name: 'Tunic', externalId: 'tunic' });
    const service = createGameProviderService([
      createManualProvider(backend.games),
      createSteamProvider(createFakeStore({ searchFails: true })),
    ]);

    const result = await service.search('tunic');

    expect(result.ok && result.value.games).toHaveLength(1);
    expect(result.ok && result.value.failures).toMatchObject([
      { provider: 'steam' },
    ]);
  });

  it('fails when every provider fails', async () => {
    const service = createGameProviderService([
      createSteamProvider(createFakeStore({ searchFails: true })),
    ]);

    const result = await service.search('x');

    expect(result).toMatchObject({ ok: false, error: { provider: 'steam' } });
  });

  it('routes fetch to the provider of the given source', async () => {
    const result = await buildService().fetch('steam', '5');

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Shovel Knight' },
    });
  });

  it('reports a source without provider', async () => {
    const service = createGameProviderService([]);

    const result = await service.fetch('manual', 'x');

    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });
});
