import { describe, it, expect } from 'vitest';
import { err, ok } from '@common/result.js';
import { syncLibrary } from '../library-sync.js';
import {
  DB_FAILURE,
  createFailingSteam,
  createFakeSteam,
  createInMemoryBackend,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';

describe('syncLibrary', () => {
  it('stores games and library entries and summarises the run', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam(sampleSteamGames()),
      games: backend.games,
      library: backend.library,
    });

    // 3120 + 0 + 600 + 240 + 90 = 4050 minutes = 67.5 hours
    expect(result).toEqual({
      ok: true,
      value: { synced: 5, newGames: 5, totalPlaytime: 67.5 },
    });
    expect(backend.state.games.size).toBe(5);
    expect(backend.state.library.size).toBe(5);
  });

  it('is idempotent: a second run adds no new games or rows', async () => {
    const backend = createInMemoryBackend();
    const deps = {
      steam: createFakeSteam(sampleSteamGames()),
      games: backend.games,
      library: backend.library,
    };
    await syncLibrary(deps);

    const second = await syncLibrary(deps);

    expect(second).toEqual({
      ok: true,
      value: { synced: 5, newGames: 0, totalPlaytime: 67.5 },
    });
    expect(backend.state.games.size).toBe(5);
    expect(backend.state.library.size).toBe(5);
  });

  it('counts only unseen appids as new games', async () => {
    const backend = createInMemoryBackend();
    const [first, ...rest] = sampleSteamGames();
    await syncLibrary({
      steam: createFakeSteam([first!]),
      games: backend.games,
      library: backend.library,
    });

    const result = await syncLibrary({
      steam: createFakeSteam([first!, ...rest]),
      games: backend.games,
      library: backend.library,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { synced: 5, newGames: 4 },
    });
  });

  it('collapses a repeated appid so the upsert never sees duplicate keys', async () => {
    const backend = createInMemoryBackend();
    const [first] = sampleSteamGames();

    const result = await syncLibrary({
      steam: createFakeSteam([first!, first!]),
      games: backend.games,
      library: backend.library,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { synced: 1, newGames: 1 },
    });
  });

  it('handles an empty library', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam([]),
      games: backend.games,
      library: backend.library,
    });

    expect(result).toEqual({
      ok: true,
      value: { synced: 0, newGames: 0, totalPlaytime: 0 },
    });
  });

  it('reports a Steam failure and writes nothing', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFailingSteam('Steam rejected the request (HTTP 403)'),
      games: backend.games,
      library: backend.library,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'steam',
        message: 'Steam error: Steam rejected the request (HTTP 403)',
      },
    });
    expect(backend.state.games.size).toBe(0);
  });

  it('reports a database failure while upserting games', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam(sampleSteamGames()),
      games: {
        ...backend.games,
        upsertSteamGames: async () => err(DB_FAILURE),
      },
      library: backend.library,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'db', message: 'Database error (test): connection reset' },
    });
    expect(backend.state.library.size).toBe(0);
  });

  it('reports a database failure while storing library entries', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam(sampleSteamGames()),
      games: backend.games,
      library: {
        ...backend.library,
        upsertEntries: async () => err(DB_FAILURE),
      },
    });

    expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
  });

  it('reports a database failure while reading known appids', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam(sampleSteamGames()),
      games: { ...backend.games, listSteamAppIds: async () => err(DB_FAILURE) },
      library: backend.library,
    });

    expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
    expect(backend.state.games.size).toBe(0);
  });

  it('treats every game as new when the known-appids set is empty', async () => {
    const backend = createInMemoryBackend();

    const result = await syncLibrary({
      steam: createFakeSteam(sampleSteamGames()),
      games: {
        ...backend.games,
        listSteamAppIds: async () => ok(new Set<number>()),
      },
      library: backend.library,
    });

    expect(result).toMatchObject({ ok: true, value: { newGames: 5 } });
  });
});
