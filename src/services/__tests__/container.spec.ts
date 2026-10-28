import { describe, it, expect, vi, afterEach } from 'vitest';

const ENV_KEYS_UNDER_TEST = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'USER_ID',
  'STEAM_API_KEY',
  'STEAM_ID',
] as const;

const VALID_ENV = {
  SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  SUPABASE_SERVICE_KEY: 'sb_secret_abc123',
  USER_ID: '3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11',
  STEAM_API_KEY: '0123456789abcdef0123456789abcdef',
  STEAM_ID: '76561198020370213',
} as const;

async function loadServices(overrides: Partial<Record<string, string>>) {
  ENV_KEYS_UNDER_TEST.forEach((key) => vi.stubEnv(key, overrides[key] ?? ''));
  vi.resetModules();
  const { createServices } = await import('../container.js');
  return createServices();
}

describe('createServices', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('boots without credentials and reports what is missing on first use', async () => {
    const services = await loadServices({});

    expect(services.steam()).toEqual({
      ok: false,
      error: {
        kind: 'config',
        message: 'Missing environment variable(s): STEAM_API_KEY, STEAM_ID',
      },
    });
    expect(services.games()).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining('SUPABASE_URL, SUPABASE_SERVICE_KEY'),
      },
    });
  });

  it('asks for USER_ID when only the user-scoped repositories lack it', async () => {
    const { USER_ID: _omitted, ...withoutUser } = VALID_ENV;
    const services = await loadServices(withoutUser);

    expect(services.games().ok).toBe(true);
    expect(services.library()).toEqual({
      ok: false,
      error: {
        kind: 'config',
        message: 'Missing environment variable(s): USER_ID',
      },
    });
    expect(services.reviews().ok).toBe(false);
  });

  it('builds every dependency once the environment is complete', async () => {
    const services = await loadServices(VALID_ENV);

    expect(services.steam().ok).toBe(true);
    expect(services.games().ok).toBe(true);
    expect(services.library().ok).toBe(true);
    expect(services.reviews().ok).toBe(true);
  });

  it('memoizes each dependency', async () => {
    const services = await loadServices(VALID_ENV);

    expect(services.games()).toBe(services.games());
    expect(services.steam()).toBe(services.steam());
  });
});
