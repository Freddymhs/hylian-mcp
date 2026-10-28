import { describe, it, expect } from 'vitest';
import { createGameRepository } from '../games.repository.js';
import { createFakeSupabase } from './fake-postgrest.js';

describe('game repository (catalog)', () => {
  describe('search', () => {
    const row = {
      id: 'uuid-1',
      source: 'manual',
      steam_appid: null,
      name: 'Tunic (Switch)',
      metadata: { tags: ['zelda-like'] },
    };

    it('matches name, tags and genres with a quoted, escaped LIKE pattern', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [row],
      }));

      const result = await createGameRepository(client).search({
        query: '100%, "x"',
        source: 'all',
        limit: 20,
      });

      const { searchParams } = requests[0]!.url;
      const pattern = '"%100\\\\%, \\"x\\"%"';
      expect(searchParams.get('or')).toBe(
        `(name.ilike.${pattern},metadata->>tags.ilike.${pattern},metadata->>genres.ilike.${pattern})`,
      );
      expect(searchParams.get('limit')).toBe('20');
      expect(searchParams.get('source')).toBeNull();
      expect(result).toEqual({
        ok: true,
        value: [
          {
            id: 'uuid-1',
            source: 'manual',
            steamAppId: null,
            name: 'Tunic (Switch)',
            metadata: { tags: ['zelda-like'] },
          },
        ],
      });
    });

    it('adds a source filter when not searching everything', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [],
      }));

      await createGameRepository(client).search({
        query: 'x',
        source: 'steam',
        limit: 5,
      });

      expect(requests[0]?.url.searchParams.get('source')).toBe('eq.steam');
    });

    it('returns a DbError when PostgREST rejects the filter', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 400,
        body: {
          code: 'PGRST100',
          details: null,
          hint: null,
          message: 'failed to parse logic tree',
        },
      }));

      const result = await createGameRepository(client).search({
        query: 'x',
        source: 'all',
        limit: 5,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { operation: 'games.search', code: 'PGRST100' },
      });
    });
  });

  describe('insertManual', () => {
    it('inserts a manual game and returns its ref', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 201,
        body: { id: 'uuid-9', steam_appid: null, name: 'Tunic (Switch)' },
      }));

      const result = await createGameRepository(client).insertManual({
        externalId: 'ext-1',
        name: 'Tunic (Switch)',
        metadata: { tags: ['zelda-like'] },
      });

      expect(requests[0]?.method).toBe('POST');
      expect(requests[0]?.body).toEqual({
        source: 'manual',
        external_id: 'ext-1',
        name: 'Tunic (Switch)',
        metadata: { tags: ['zelda-like'] },
      });
      expect(result).toEqual({
        ok: true,
        value: { id: 'uuid-9', steamAppId: null, name: 'Tunic (Switch)' },
      });
    });

    it('returns a DbError on a rejected insert', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 400,
        body: {
          code: '23514',
          details: null,
          hint: null,
          message: 'violates check constraint',
        },
      }));

      const result = await createGameRepository(client).insertManual({
        externalId: 'e',
        name: 'x',
        metadata: {},
      });

      expect(result).toMatchObject({
        ok: false,
        error: { operation: 'games.insertManual' },
      });
    });
  });

  it('listManualNames pages through manual games', async () => {
    const page = (size: number) =>
      Array.from({ length: size }, (_, i) => ({ name: `M${i}` }));
    const { client, requests } = createFakeSupabase(({ url }) => ({
      status: 200,
      body: page(url.searchParams.get('offset') === '0' ? 1000 : 2),
    }));

    const result = await createGameRepository(client).listManualNames();

    expect(requests[0]?.url.searchParams.get('source')).toBe('eq.manual');
    expect(result.ok && result.value).toHaveLength(1002);
  });
});
