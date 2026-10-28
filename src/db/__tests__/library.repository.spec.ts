import { describe, it, expect } from 'vitest';
import { createLibraryRepository } from '../library.repository.js';
import { TEST_USER_ID, createFakeSupabase } from './fake-postgrest.js';

const libraryRow = (name: string, playtime: number | null) => ({
  playtime_minutes: playtime,
  last_played: playtime ? '2023-11-14T22:13:20+00:00' : null,
  games: { id: `uuid-${name}`, name, steam_appid: 10 },
});

describe('library repository', () => {
  describe('upsertEntries', () => {
    it('upserts by (user_id, game_id) and leaves acquired_at alone', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 201,
        body: null,
      }));

      const result = await createLibraryRepository(
        client,
        TEST_USER_ID,
      ).upsertEntries([
        {
          gameId: 'uuid-1',
          playtimeMinutes: 90,
          lastPlayed: '2023-11-14T22:13:20.000Z',
        },
      ]);

      expect(requests[0]?.url.pathname).toBe('/rest/v1/user_library');
      expect(requests[0]?.url.searchParams.get('on_conflict')).toBe(
        'user_id,game_id',
      );
      expect(requests[0]?.body).toEqual([
        {
          user_id: TEST_USER_ID,
          game_id: 'uuid-1',
          playtime_minutes: 90,
          last_played: '2023-11-14T22:13:20.000Z',
        },
      ]);
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('surfaces a write error', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 409,
        body: {
          code: '23503',
          details: 'Key is not present in table "games".',
          hint: null,
          message: 'insert violates foreign key constraint',
        },
      }));

      const result = await createLibraryRepository(
        client,
        TEST_USER_ID,
      ).upsertEntries([
        { gameId: 'ghost', playtimeMinutes: 0, lastPlayed: null },
      ]);

      expect(result).toMatchObject({
        ok: false,
        error: { operation: 'user_library.upsertEntries', code: '23503' },
      });
    });
  });

  describe('list', () => {
    it('joins games for the configured user and maps the embedded row', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [libraryRow('Hollow Knight', 3120), libraryRow('Portal', null)],
      }));

      const result = await createLibraryRepository(client, TEST_USER_ID).list(
        'all',
      );

      const { searchParams } = requests[0]!.url;
      expect(searchParams.get('user_id')).toBe(`eq.${TEST_USER_ID}`);
      expect(searchParams.get('select')).toContain(
        'games(id,name,steam_appid)',
      );
      expect(searchParams.get('playtime_minutes')).toBeNull();
      expect(result).toEqual({
        ok: true,
        value: [
          {
            gameId: 'uuid-Hollow Knight',
            name: 'Hollow Knight',
            steamAppId: 10,
            playtimeMinutes: 3120,
            lastPlayed: '2023-11-14T22:13:20+00:00',
          },
          {
            gameId: 'uuid-Portal',
            name: 'Portal',
            steamAppId: 10,
            playtimeMinutes: 0,
            lastPlayed: null,
          },
        ],
      });
    });

    it.each([
      ['played', 'gt.0'],
      ['unplayed', 'eq.0'],
    ] as const)(
      'filters %s games on playtime_minutes',
      async (filter, expected) => {
        const { client, requests } = createFakeSupabase(() => ({
          status: 200,
          body: [],
        }));

        await createLibraryRepository(client, TEST_USER_ID).list(filter);

        expect(requests[0]?.url.searchParams.get('playtime_minutes')).toBe(
          expected,
        );
      },
    );

    it('skips rows whose game no longer exists', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 200,
        body: [{ playtime_minutes: 1, last_played: null, games: null }],
      }));

      const result = await createLibraryRepository(client, TEST_USER_ID).list(
        'all',
      );

      expect(result).toEqual({ ok: true, value: [] });
    });
  });
});
