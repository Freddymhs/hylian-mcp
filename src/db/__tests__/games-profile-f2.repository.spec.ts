import { describe, it, expect } from 'vitest';
import { createGameRepository } from '../games.repository.js';
import { createProfileRepository } from '../profile.repository.js';
import { TEST_USER_ID, createFakeSupabase } from './fake-postgrest.js';

describe('game repository (FASE_2)', () => {
  it('deleteById returns the removed game', async () => {
    const { client, requests } = createFakeSupabase(() => ({
      status: 200,
      body: [{ id: 'uuid-1', steam_appid: 367520, name: 'Hollow Knight' }],
    }));

    const result = await createGameRepository(client).deleteById('uuid-1');

    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.url.searchParams.get('id')).toBe('eq.uuid-1');
    expect(result).toEqual({
      ok: true,
      value: { id: 'uuid-1', steamAppId: 367520, name: 'Hollow Knight' },
    });
  });

  it('deleteById returns null for an unknown id', async () => {
    const { client } = createFakeSupabase(() => ({ status: 200, body: [] }));

    const result = await createGameRepository(client).deleteById('ghost');

    expect(result).toEqual({ ok: true, value: null });
  });

  it('searchManual filters on source = manual and escapes wildcards', async () => {
    const { client, requests } = createFakeSupabase(() => ({
      status: 200,
      body: [
        {
          id: 'uuid-2',
          external_id: 'tunic-switch',
          name: 'Tunic (Switch)',
          metadata: { tags: ['zelda-like'] },
        },
      ],
    }));

    const result = await createGameRepository(client).searchManual('100%');

    const { searchParams } = requests[0]!.url;
    expect(searchParams.get('source')).toBe('eq.manual');
    expect(searchParams.get('name')).toBe('ilike.%100\\%%');
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: 'uuid-2',
          externalId: 'tunic-switch',
          name: 'Tunic (Switch)',
          metadata: { tags: ['zelda-like'] },
        },
      ],
    });
  });

  it('getManualByExternalId returns the first match or null', async () => {
    const found = createFakeSupabase(() => ({
      status: 200,
      body: [
        {
          id: 'uuid-2',
          external_id: 'tunic-switch',
          name: 'Tunic',
          metadata: {},
        },
      ],
    }));
    const missing = createFakeSupabase(() => ({ status: 200, body: [] }));

    const hit = await createGameRepository(found.client).getManualByExternalId(
      'tunic-switch',
    );
    const miss = await createGameRepository(
      missing.client,
    ).getManualByExternalId('nope');

    expect(found.requests[0]?.url.searchParams.get('external_id')).toBe(
      'eq.tunic-switch',
    );
    expect(hit).toMatchObject({ ok: true, value: { id: 'uuid-2' } });
    expect(miss).toEqual({ ok: true, value: null });
  });
});

describe('profile repository', () => {
  it('reads the cached profile of the user', async () => {
    const { client, requests } = createFakeSupabase(() => ({
      status: 200,
      body: [
        {
          tag_weights: { metroidvania: 30.83 },
          computed_at: '2026-10-24T12:00:00+00:00',
        },
      ],
    }));

    const result = await createProfileRepository(client, TEST_USER_ID).get();

    expect(requests[0]?.url.searchParams.get('user_id')).toBe(
      `eq.${TEST_USER_ID}`,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        tagWeights: { metroidvania: 30.83 },
        computedAt: '2026-10-24T12:00:00+00:00',
      },
    });
  });

  it('returns null when nothing is cached', async () => {
    const { client } = createFakeSupabase(() => ({ status: 200, body: [] }));

    const result = await createProfileRepository(client, TEST_USER_ID).get();

    expect(result).toEqual({ ok: true, value: null });
  });

  it('rejects a cached row whose tag_weights is not a tag → number map', async () => {
    const { client } = createFakeSupabase(() => ({
      status: 200,
      body: [
        {
          tag_weights: { rpg: 'heavy' },
          computed_at: '2026-10-24T12:00:00+00:00',
        },
      ],
    }));

    const result = await createProfileRepository(client, TEST_USER_ID).get();

    expect(result).toMatchObject({
      ok: false,
      error: { operation: 'user_profile.get' },
    });
  });

  it('upserts the profile by user_id', async () => {
    const { client, requests } = createFakeSupabase(() => ({
      status: 201,
      body: null,
    }));

    const result = await createProfileRepository(client, TEST_USER_ID).save({
      tagWeights: { rpg: 80 },
      computedAt: '2026-10-24T12:00:00.000Z',
    });

    expect(requests[0]?.url.searchParams.get('on_conflict')).toBe('user_id');
    expect(requests[0]?.body).toEqual({
      user_id: TEST_USER_ID,
      tag_weights: { rpg: 80 },
      computed_at: '2026-10-24T12:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });
});
