import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MockAgent } from 'undici';
import { createSteamClient } from '../client.js';

const API_KEY = '0123456789ABCDEF0123456789ABCDEF';
const STEAM_ID = '76561198020370213';
const BASE_URL = 'https://api.steampowered.com';
const OWNED_GAMES_PATH = '/IPlayerService/GetOwnedGames/v1/';
const OWNED_GAMES_QUERY = {
  key: API_KEY,
  steamid: STEAM_ID,
  include_appinfo: '1',
  include_played_free_games: '1',
  format: 'json',
};

// Body as documented for GetOwnedGames/v1 with include_appinfo=1 (unix seconds, minutes).
const OWNED_GAMES_BODY = {
  response: {
    game_count: 2,
    games: [
      {
        appid: 367520,
        name: 'Hollow Knight',
        playtime_forever: 3120,
        img_icon_url: 'abcdef0123456789abcdef0123456789abcdef01',
        playtime_windows_forever: 3120,
        playtime_mac_forever: 0,
        playtime_linux_forever: 0,
        rtime_last_played: 1700000000,
      },
      {
        appid: 10,
        name: 'Counter-Strike',
        playtime_forever: 0,
        img_icon_url: '6b0312cda02f5f777efa2f3318c307ff9acafbb5',
        playtime_windows_forever: 0,
        playtime_mac_forever: 0,
        playtime_linux_forever: 0,
        rtime_last_played: 0,
      },
    ],
  },
};

function setup() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  onTestFinished(() => agent.close());
  const steam = agent.get(BASE_URL);
  const sleep = vi.fn(async (_ms: number) => {});

  const buildClient = (timeoutMs?: number) =>
    createSteamClient({
      apiKey: API_KEY,
      steamId: STEAM_ID,
      dispatcher: agent,
      sleep,
      ...(timeoutMs && { timeoutMs }),
    });

  const interceptOwnedGames = () =>
    steam.intercept({
      path: OWNED_GAMES_PATH,
      method: 'GET',
      query: OWNED_GAMES_QUERY,
    });

  return { buildClient, interceptOwnedGames, sleep };
}

describe('steam client getOwnedGames', () => {
  it('maps owned games and sends the documented query', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, OWNED_GAMES_BODY);

    const result = await buildClient().getOwnedGames();

    expect(result).toEqual({
      ok: true,
      value: [
        {
          appId: 367520,
          name: 'Hollow Knight',
          playtimeMinutes: 3120,
          lastPlayedAt: '2023-11-14T22:13:20.000Z',
        },
        {
          appId: 10,
          name: 'Counter-Strike',
          playtimeMinutes: 0,
          lastPlayedAt: null,
        },
      ],
    });
  });

  it('names a game without name after its appid', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, {
      response: { game_count: 1, games: [{ appid: 99, playtime_forever: 5 }] },
    });

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: true,
      value: [{ appId: 99, name: 'Steam App 99' }],
    });
  });

  it('accepts an account that owns zero games', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, { response: { game_count: 0 } });

    const result = await buildClient().getOwnedGames();

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('reports a private profile (empty response object)', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, { response: {} });

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'no_library_data' },
    });
  });

  it('retries 5xx with 200/500 ms backoff and then succeeds', async () => {
    const { buildClient, interceptOwnedGames, sleep } = setup();
    interceptOwnedGames().reply(503, 'Service Unavailable');
    interceptOwnedGames().reply(500, 'Internal Server Error');
    interceptOwnedGames().reply(200, OWNED_GAMES_BODY);

    const result = await buildClient().getOwnedGames();

    expect(result.ok).toBe(true);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200, 500]);
  });

  it('gives up after 3 retries (200/500/1500 ms) on persistent 5xx', async () => {
    const { buildClient, interceptOwnedGames, sleep } = setup();
    interceptOwnedGames().reply(502, 'Bad Gateway').times(4);

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'http', status: 502 },
    });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200, 500, 1500]);
  });

  it('does not retry 403 and never leaks the API key', async () => {
    const { buildClient, interceptOwnedGames, sleep } = setup();
    interceptOwnedGames().reply(403, '<html>Forbidden</html>');

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'http', status: 403 },
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails with timeout when Steam does not answer in time', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, OWNED_GAMES_BODY).delay(300);

    const result = await buildClient(30).getOwnedGames();

    expect(result).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('fails with network error when the connection is refused', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().replyWithError(new Error('connect ECONNREFUSED'));

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('rejects a body that is not JSON', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, '<html>maintenance</html>');

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response' },
    });
  });

  it('rejects JSON that does not match the documented shape', async () => {
    const { buildClient, interceptOwnedGames } = setup();
    interceptOwnedGames().reply(200, {
      response: { games: [{ appid: 'not-a-number' }] },
    });

    const result = await buildClient().getOwnedGames();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response' },
    });
  });
});
