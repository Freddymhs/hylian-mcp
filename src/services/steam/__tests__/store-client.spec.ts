import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { MockAgent } from 'undici';
import { createStoreClient } from '../store-client.js';

const BASE_URL = 'https://store.steampowered.com';
const SEARCH_PATH = '/api/storesearch/';
const DETAILS_PATH = '/api/appdetails';

// Shapes as returned by the Store API (prices in cents, genres[].id is a string).
const SEARCH_BODY = {
  total: 3,
  items: [
    {
      type: 'app',
      name: 'Hollow Knight',
      id: 367520,
      price: { currency: 'USD', initial: 1499, final: 749 },
      tiny_image:
        'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/capsule_231x87.jpg',
      metascore: '87',
      platforms: { windows: true, mac: true, linux: true },
      streamingvideo: false,
    },
    {
      type: 'app',
      name: 'Free To Play Thing',
      id: 123,
      tiny_image: 'https://example.invalid/tiny.jpg',
      metascore: '',
      platforms: { windows: true, mac: false, linux: false },
      streamingvideo: false,
    },
    {
      type: 'app',
      name: 'Euro Priced',
      id: 456,
      price: { currency: 'EUR', initial: 999, final: 999 },
      tiny_image: 'https://example.invalid/tiny2.jpg',
      metascore: '',
      platforms: { windows: true, mac: false, linux: false },
      streamingvideo: false,
    },
  ],
};

const detailsBody = (appId: number, data: Record<string, unknown>) => ({
  [String(appId)]: { success: true, data },
});

const HOLLOW_KNIGHT = {
  type: 'game',
  name: 'Hollow Knight',
  steam_appid: 367520,
  is_free: false,
  short_description:
    'Forge your own path in a vast ruined kingdom of insects and heroes.',
  genres: [
    { id: '1', description: 'Action' },
    { id: '23', description: 'Indie' },
  ],
  categories: [
    { id: 2, description: 'Single-player' },
    { id: 22, description: 'Steam Achievements' },
  ],
  price_overview: {
    currency: 'USD',
    initial: 1499,
    final: 749,
    discount_percent: 50,
    initial_formatted: '$14.99',
    final_formatted: '$7.49',
  },
};

function setup() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  onTestFinished(() => agent.close());
  const store = agent.get(BASE_URL);
  const sleep = vi.fn(async (_ms: number) => {});

  const buildClient = () => createStoreClient({ dispatcher: agent, sleep });

  const interceptSearch = (term: string) =>
    store.intercept({
      path: SEARCH_PATH,
      method: 'GET',
      query: { term, cc: 'us', l: 'english' },
    });

  const interceptDetails = (appId: number) =>
    store.intercept({
      path: DETAILS_PATH,
      method: 'GET',
      query: { appids: String(appId), cc: 'us', l: 'english' },
    });

  return { buildClient, interceptSearch, interceptDetails, sleep };
}

describe('steam store client', () => {
  describe('search', () => {
    it('maps results and converts cents to USD', async () => {
      const { buildClient, interceptSearch } = setup();
      interceptSearch('metroidvania').reply(200, SEARCH_BODY);

      const result = await buildClient().search('metroidvania');

      expect(result).toEqual({
        ok: true,
        value: [
          { appId: 367520, name: 'Hollow Knight', priceUSD: 7.49 },
          { appId: 123, name: 'Free To Play Thing', priceUSD: null },
          { appId: 456, name: 'Euro Priced', priceUSD: null },
        ],
      });
    });

    it('sends the term URL-encoded', async () => {
      const { buildClient, interceptSearch } = setup();
      interceptSearch('souls like & co-op').reply(200, { total: 0, items: [] });

      const result = await buildClient().search('souls like & co-op');

      expect(result).toEqual({ ok: true, value: [] });
    });

    it('reports HTTP errors without retrying a 429', async () => {
      const { buildClient, interceptSearch, sleep } = setup();
      interceptSearch('x').reply(429, '');

      const result = await buildClient().search('x');

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'http', status: 429 },
      });
      expect(sleep).not.toHaveBeenCalled();
    });

    it('rejects a body that does not match the expected shape', async () => {
      const { buildClient, interceptSearch } = setup();
      interceptSearch('x').reply(200, { items: [{ name: 'no id or type' }] });

      const result = await buildClient().search('x');

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'invalid_response' },
      });
    });
  });

  describe('getAppDetails', () => {
    it('maps genres, categories and the discounted price', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(367520).reply(200, detailsBody(367520, HOLLOW_KNIGHT));

      const result = await buildClient().getAppDetails(367520);

      expect(result).toEqual({
        ok: true,
        value: {
          appId: 367520,
          name: 'Hollow Knight',
          priceUSD: 7.49,
          isFree: false,
          genres: ['Action', 'Indie'],
          categories: ['Single-player', 'Steam Achievements'],
          description: HOLLOW_KNIGHT.short_description,
          storeUrl: 'https://store.steampowered.com/app/367520',
        },
      });
    });

    it('prices a free game at 0', async () => {
      const { buildClient, interceptDetails } = setup();
      const { price_overview: _omitted, ...free } = HOLLOW_KNIGHT;
      interceptDetails(367520).reply(
        200,
        detailsBody(367520, { ...free, is_free: true }),
      );

      const result = await buildClient().getAppDetails(367520);

      expect(result).toMatchObject({
        ok: true,
        value: { priceUSD: 0, isFree: true },
      });
    });

    it('leaves the price unknown when it is not in USD', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(367520).reply(
        200,
        detailsBody(367520, {
          ...HOLLOW_KNIGHT,
          price_overview: { currency: 'EUR', initial: 999, final: 999 },
        }),
      );

      const result = await buildClient().getAppDetails(367520);

      expect(result).toMatchObject({ ok: true, value: { priceUSD: null } });
    });

    it('returns null for success:false (unknown or region-locked app)', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(1).reply(200, { '1': { success: false } });

      const result = await buildClient().getAppDetails(1);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns null for non-game apps such as DLC', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(999).reply(
        200,
        detailsBody(999, { ...HOLLOW_KNIGHT, steam_appid: 999, type: 'dlc' }),
      );

      const result = await buildClient().getAppDetails(999);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('retries 5xx with backoff', async () => {
      const { buildClient, interceptDetails, sleep } = setup();
      interceptDetails(367520).reply(503, 'unavailable');
      interceptDetails(367520).reply(200, detailsBody(367520, HOLLOW_KNIGHT));

      const result = await buildClient().getAppDetails(367520);

      expect(result.ok).toBe(true);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200]);
    });

    it('rejects a body that is not JSON', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(1).reply(200, '<html>rate limited</html>');

      const result = await buildClient().getAppDetails(1);

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'invalid_response' },
      });
    });

    it('rejects an entry whose data has the wrong shape', async () => {
      const { buildClient, interceptDetails } = setup();
      interceptDetails(1).reply(200, {
        '1': { success: true, data: { type: 'game', name: 7 } },
      });

      const result = await buildClient().getAppDetails(1);

      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'invalid_response' },
      });
    });
  });
});
