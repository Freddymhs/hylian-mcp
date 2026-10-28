import { describe, it, expect } from 'vitest';
import { createGameRepository } from '../games.repository.js';
import { TABLE_NOT_FOUND_ERROR, createFakeSupabase } from './fake-postgrest.js';
import type { RecordedRequest } from './fake-postgrest.js';

const echoUpsertedRows = (request: RecordedRequest) => {
  const rows = request.body as { steam_appid: number; name: string }[];
  return {
    status: 201,
    body: rows.map(({ steam_appid, name }) => ({
      id: `uuid-${steam_appid}`,
      steam_appid,
      name,
    })),
  };
};

describe('game repository', () => {
  describe('upsertSteamGames', () => {
    it('upserts on steam_appid without touching metadata', async () => {
      const { client, requests } = createFakeSupabase(echoUpsertedRows);

      const result = await createGameRepository(client).upsertSteamGames([
        { steamAppId: 367520, name: 'Hollow Knight' },
      ]);

      const [request] = requests;
      expect(request?.method).toBe('POST');
      expect(request?.url.pathname).toBe('/rest/v1/games');
      expect(request?.url.searchParams.get('on_conflict')).toBe('steam_appid');
      expect(request?.headers.get('prefer')).toContain(
        'resolution=merge-duplicates',
      );
      expect(request?.body).toEqual([
        {
          steam_appid: 367520,
          external_id: '367520',
          source: 'steam',
          name: 'Hollow Knight',
        },
      ]);
      expect(result).toEqual({
        ok: true,
        value: [
          { id: 'uuid-367520', steamAppId: 367520, name: 'Hollow Knight' },
        ],
      });
    });

    it('splits large syncs into requests of 500 rows', async () => {
      const { client, requests } = createFakeSupabase(echoUpsertedRows);
      const games = Array.from({ length: 1200 }, (_, index) => ({
        steamAppId: index + 1,
        name: `Game ${index + 1}`,
      }));

      const result = await createGameRepository(client).upsertSteamGames(games);

      expect(requests.map(({ body }) => (body as unknown[]).length)).toEqual([
        500, 500, 200,
      ]);
      expect(result.ok && result.value).toHaveLength(1200);
    });

    it('returns a DbError when PostgREST rejects the write', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 404,
        body: TABLE_NOT_FOUND_ERROR,
      }));

      const result = await createGameRepository(client).upsertSteamGames([
        { steamAppId: 1, name: 'A' },
      ]);

      expect(result).toEqual({
        ok: false,
        error: {
          operation: 'games.upsertSteamGames',
          message: TABLE_NOT_FOUND_ERROR.message,
          code: 'PGRST205',
        },
      });
    });
  });

  describe('listSteamAppIds', () => {
    it('pages through results 1000 rows at a time', async () => {
      const pageOf = (offset: number, size: number) =>
        Array.from({ length: size }, (_, index) => ({
          steam_appid: offset + index + 1,
        }));
      const { client, requests } = createFakeSupabase(({ url }) => {
        const offset = Number(url.searchParams.get('offset'));
        return { status: 200, body: pageOf(offset, offset === 0 ? 1000 : 3) };
      });

      const result = await createGameRepository(client).listSteamAppIds();

      expect(requests.map(({ url }) => url.searchParams.get('offset'))).toEqual(
        ['0', '1000'],
      );
      expect(requests[0]?.url.searchParams.get('source')).toBe('eq.steam');
      expect(result.ok && result.value.size).toBe(1003);
    });
  });

  describe('findByName', () => {
    it('matches case-insensitively and escapes LIKE wildcards', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [
          { id: 'uuid-1', steam_appid: 282800, name: '100% Orange Juice' },
        ],
      }));

      const result =
        await createGameRepository(client).findByName('100% or_ange');

      expect(requests[0]?.url.searchParams.get('name')).toBe(
        'ilike.%100\\% or\\_ange%',
      );
      expect(result).toEqual({
        ok: true,
        value: [
          { id: 'uuid-1', steamAppId: 282800, name: '100% Orange Juice' },
        ],
      });
    });
  });
});
