import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import {
  createGameProviderService,
  createManualProvider,
  createSteamProvider,
} from '@providers/index.js';
import { createProfileService } from '../../profile/service.js';
import { recommendPurchases } from '../recommend.js';
import type { RecommendDeps } from '../recommend.js';
import {
  DB_FAILURE,
  createInMemoryBackend,
  sampleSteamGames,
} from '../../../__tests__/support/in-memory.js';
import {
  createFakeStore,
  storeDetails,
} from '../../../__tests__/support/fake-store.js';

const HOLLOW_KNIGHT_ID = 367520;

// Profile from 3 reviews: metroidvania (95+90)/3, "souls like" 95/3, platformer 60/3.
async function buildScenario(storeOverrides = {}) {
  const backend = createInMemoryBackend();
  await backend.games.upsertSteamGames(
    sampleSteamGames().map(({ appId, name }) => ({ steamAppId: appId, name })),
  );
  const [hollowKnight] = [...backend.state.games.values()].filter(
    ({ steamAppId }) => steamAppId === HOLLOW_KNIGHT_ID,
  );
  backend.state.library.set(hollowKnight!.id, {
    gameId: hollowKnight!.id,
    playtimeMinutes: 3120,
    lastPlayed: null,
  });
  await backend.reviews.insert({
    gameId: 'g',
    text: 't',
    autoRank: 95,
    extractedTags: ['metroidvania', 'souls like'],
  });
  await backend.reviews.insert({
    gameId: 'g',
    text: 't',
    autoRank: 90,
    extractedTags: ['metroidvania'],
  });
  await backend.reviews.insert({
    gameId: 'g',
    text: 't',
    autoRank: 60,
    extractedTags: ['platformer'],
  });

  const store = createFakeStore({
    search: {
      metroidvania: [
        { appId: HOLLOW_KNIGHT_ID, name: 'Hollow Knight', priceUSD: 7.49 },
        { appId: 1, name: 'Ori Like', priceUSD: 19.99 },
        { appId: 2, name: 'Axiom Like', priceUSD: 9.99 },
        { appId: 3, name: 'Pricey Vania', priceUSD: 59.99 },
      ],
      'souls like': [
        { appId: 1, name: 'Ori Like', priceUSD: 19.99 },
        { appId: 4, name: 'Salt Like', priceUSD: null },
      ],
      platformer: [{ appId: 5, name: 'Celeste Like', priceUSD: 19.99 }],
    },
    details: {
      1: storeDetails(1, {
        name: 'Ori Like',
        priceUSD: 19.99,
        genres: ['Platformer', 'Metroidvania'],
      }),
      2: storeDetails(2, {
        name: 'Axiom Like',
        priceUSD: 9.99,
        genres: ['Action'],
        description: 'A sprawling Metroidvania set on a dying world.',
      }),
      3: storeDetails(3, {
        name: 'Pricey Vania',
        priceUSD: 59.99,
        genres: ['Metroidvania'],
      }),
      4: storeDetails(4, {
        name: 'Salt Like',
        priceUSD: 29.99,
        genres: ['Souls-like'],
      }),
      5: storeDetails(5, {
        name: 'Celeste Like',
        priceUSD: 19.99,
        genres: ['Platformer'],
      }),
    },
    ...storeOverrides,
  });
  const deps: RecommendDeps = {
    profile: createProfileService({
      reviews: backend.reviews,
      profile: backend.profile,
    }),
    providers: createGameProviderService([
      createManualProvider(backend.games),
      createSteamProvider(store),
    ]),
    library: backend.library,
    games: backend.games,
  };
  return { backend, store, deps };
}

const summarize = (result: Awaited<ReturnType<typeof recommendPurchases>>) =>
  result.ok
    ? result.value.recommendations.map(({ game, score }) => [game.name, score])
    : result.error;

describe('recommendPurchases', () => {
  it('searches the top profile tags and ranks unowned candidates', async () => {
    const { deps, store } = await buildScenario();

    const result = await recommendPurchases(deps, { limit: 10 });

    expect(store.searchedTerms).toEqual([
      'metroidvania',
      'souls like',
      'platformer',
    ]);
    // weights: metroidvania 61.67, souls like 31.67, platformer 20
    // raw: Ori 81.67 (metroidvania + platformer) = 100; Axiom/Pricey 61.67 → 76; Salt 31.67 → 39; Celeste 20 → 24
    expect(summarize(result)).toEqual([
      ['Ori Like', 100],
      ['Axiom Like', 76],
      ['Pricey Vania', 76],
      ['Salt Like', 39],
      ['Celeste Like', 24],
    ]);
  });

  it('never spends a detail request on an owned game', async () => {
    const { deps, store } = await buildScenario();

    await recommendPurchases(deps, { limit: 10 });

    expect(store.detailRequests).not.toContain(HOLLOW_KNIGHT_ID);
  });

  it('catches a profile tag that only appears in the description', async () => {
    const { deps } = await buildScenario();

    const result = await recommendPurchases(deps, { limit: 10 });

    const axiom = result.ok
      ? result.value.recommendations.find(
          ({ game }) => game.name === 'Axiom Like',
        )
      : undefined;
    expect(axiom?.matchedTags).toEqual(['metroidvania']);
  });

  it('honours maxPrice: known prices before details, unknown ones after', async () => {
    const { deps, store } = await buildScenario();

    const result = await recommendPurchases(deps, { limit: 10, maxPrice: 15 });

    expect(summarize(result)).toEqual([['Axiom Like', 100]]);
    // Ori (19.99), Pricey Vania (59.99) and Celeste (19.99) were cut by the search price;
    // Salt Like had no price in search, so its details were fetched and then it was cut.
    expect(store.detailRequests.sort()).toEqual([2, 4]);
  });

  it('uses the criteria as the only search term', async () => {
    const { deps, store } = await buildScenario({
      search: { 'co-op': [{ appId: 2, name: 'Axiom Like', priceUSD: 9.99 }] },
    });

    const result = await recommendPurchases(deps, {
      limit: 10,
      criteria: ' co-op ',
    });

    expect(store.searchedTerms).toEqual(['co-op']);
    expect(summarize(result)).toEqual([['Axiom Like', 100]]);
  });

  it('respects limit', async () => {
    const { deps } = await buildScenario();

    const result = await recommendPurchases(deps, { limit: 2 });

    expect(summarize(result)).toEqual([
      ['Ori Like', 100],
      ['Axiom Like', 76],
    ]);
  });

  it('skips candidates whose details are unavailable and reports how many', async () => {
    const { deps } = await buildScenario();
    const brokenDetails = createFakeStore({
      search: {
        metroidvania: [
          { appId: 2, name: 'Axiom Like', priceUSD: 9.99 },
          { appId: 9, name: 'Ghost', priceUSD: 5 },
        ],
      },
      details: {
        2: storeDetails(2, { name: 'Axiom Like', genres: ['Metroidvania'] }),
      },
    });

    const result = await recommendPurchases(
      {
        ...deps,
        providers: createGameProviderService([
          createSteamProvider(brokenDetails),
        ]),
      },
      { limit: 10 },
    );

    expect(result).toMatchObject({
      ok: true,
      value: { evaluated: 1, skipped: 1 },
    });
  });

  it('asks for reviews when there is no profile yet', async () => {
    const backend = createInMemoryBackend();
    const store = createFakeStore();

    const result = await recommendPurchases(
      {
        profile: createProfileService({
          reviews: backend.reviews,
          profile: backend.profile,
        }),
        providers: createGameProviderService([createSteamProvider(store)]),
        library: backend.library,
        games: backend.games,
      },
      { limit: 10 },
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'not_found' } });
    expect(store.searchedTerms).toEqual([]);
  });

  it('fails when Steam cannot be searched at all', async () => {
    const { deps } = await buildScenario();
    const down = createFakeStore({ searchFails: true });

    const result = await recommendPurchases(
      {
        ...deps,
        providers: createGameProviderService([createSteamProvider(down)]),
      },
      { limit: 10 },
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'steam' } });
  });

  it('keeps going when one provider fails and reports it as a warning', async () => {
    const { backend, deps } = await buildScenario();
    const partlyDown = createFakeStore({
      search: {
        metroidvania: [{ appId: 2, name: 'Axiom Like', priceUSD: 9.99 }],
      },
      details: {
        2: storeDetails(2, { name: 'Axiom Like', genres: ['Metroidvania'] }),
      },
    });
    const flaky = {
      ...partlyDown,
      search: async (term: string) =>
        term === 'metroidvania'
          ? partlyDown.search(term)
          : err({ kind: 'network' as const, message: 'Could not reach Steam' }),
    };

    const result = await recommendPurchases(
      {
        ...deps,
        providers: createGameProviderService([
          createManualProvider(backend.games),
          createSteamProvider(flaky),
        ]),
      },
      { limit: 10 },
    );

    expect(summarize(result)).toEqual([['Axiom Like', 100]]);
    expect(result.ok && result.value.warnings).toEqual([
      'Steam Store: Could not reach Steam',
    ]);
  });

  it('never recommends a manual game, and it hides the Steam hit with the same name', async () => {
    const { backend, deps } = await buildScenario();
    backend.addManualGame({
      name: 'Axiom Like',
      externalId: 'axiom-physical',
      metadata: { tags: ['metroidvania'] },
    });
    backend.addManualGame({
      name: 'Cartridge Vania',
      externalId: 'cv',
      metadata: { tags: ['metroidvania'] },
    });

    const result = await recommendPurchases(deps, { limit: 10 });

    const names = result.ok
      ? result.value.recommendations.map(({ game }) => game.name)
      : [];
    expect(names).not.toContain('Cartridge Vania');
    expect(names).not.toContain('Axiom Like');
    expect(names).toContain('Ori Like');
  });

  it('reports a library read failure', async () => {
    const { deps } = await buildScenario();

    const result = await recommendPurchases(
      {
        ...deps,
        library: { ...deps.library, list: async () => err(DB_FAILURE) },
      },
      { limit: 10 },
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
  });
});
