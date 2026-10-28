import { describe, it, expect } from 'vitest';
import { err } from '@common/result.js';
import { resolveGameByName } from '../game-lookup.js';
import {
  DB_FAILURE,
  createInMemoryBackend,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';

async function seededBackend() {
  const backend = createInMemoryBackend();
  await backend.games.upsertSteamGames(
    sampleSteamGames().map(({ appId, name }) => ({ steamAppId: appId, name })),
  );
  return backend;
}

describe('resolveGameByName', () => {
  it('resolves a case-insensitive exact name even when it is also a prefix', async () => {
    const { games } = await seededBackend();

    const result = await resolveGameByName(games, 'portal');

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Portal', steamAppId: 400 },
    });
  });

  it('resolves a unique partial match', async () => {
    const { games } = await seededBackend();

    const result = await resolveGameByName(games, 'hollow');

    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Hollow Knight' },
    });
  });

  it('refuses an ambiguous partial match and lists the candidates', async () => {
    const { games } = await seededBackend();

    const result = await resolveGameByName(games, 'counter');

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'ambiguous',
        message:
          '"counter" matches several games: "Counter-Strike", "Counter-Strike 2". Use the full name',
      },
    });
  });

  it('explains how to recover when the game is unknown', async () => {
    const { games } = await seededBackend();

    const result = await resolveGameByName(games, 'Elden Ring');

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'not_found',
        message:
          'Game "Elden Ring" not found. Run sync_library first or use add_manual_game',
      },
    });
  });

  it('propagates a database failure', async () => {
    const { games } = await seededBackend();

    const result = await resolveGameByName(
      { ...games, findByName: async () => err(DB_FAILURE) },
      'portal',
    );

    expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
  });
});
