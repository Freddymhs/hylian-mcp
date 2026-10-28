import { describe, it, expect, vi, afterEach } from 'vitest';

async function loadEnv() {
  vi.resetModules();
  return import('../env.js');
}

describe('env validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('applies defaults when variables are absent', async () => {
    vi.stubEnv('NODE_ENV', undefined);
    vi.stubEnv('MCP_TRANSPORT', undefined);
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('LOG_LEVEL', undefined);
    vi.stubEnv('SUPABASE_URL', undefined);
    vi.stubEnv('SUPABASE_SERVICE_KEY', undefined);
    vi.stubEnv('USER_ID', undefined);
    vi.stubEnv('STEAM_API_KEY', undefined);
    vi.stubEnv('STEAM_ID', undefined);
    vi.stubEnv('MCP_CRON_ENABLED', undefined);
    vi.stubEnv('XDG_DATA_HOME', undefined);

    const { env } = await loadEnv();

    expect(env).toEqual({
      nodeEnv: 'development',
      transport: 'stdio',
      port: 3000,
      logLevel: 'info',
      supabaseUrl: undefined,
      supabaseServiceKey: undefined,
      userId: undefined,
      steamApiKey: undefined,
      steamId: undefined,
      cronEnabled: false,
      xdgDataHome: undefined,
    });
  });

  it('coerces PORT to number', async () => {
    vi.stubEnv('PORT', '3100');

    const { env } = await loadEnv();

    expect(env.port).toBe(3100);
  });

  it('reads the F1 variables when they are valid', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abcdefghijklmnop.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'sb_secret_abc123');
    vi.stubEnv('USER_ID', '3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11');
    vi.stubEnv('STEAM_API_KEY', '0123456789abcdef0123456789ABCDEF');
    vi.stubEnv('STEAM_ID', '76561198020370213');
    vi.stubEnv('MCP_CRON_ENABLED', 'true');

    const { env } = await loadEnv();

    expect(env).toMatchObject({
      supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
      supabaseServiceKey: 'sb_secret_abc123',
      userId: '3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11',
      steamApiKey: '0123456789abcdef0123456789ABCDEF',
      steamId: '76561198020370213',
      cronEnabled: true,
    });
  });

  it('accepts a legacy service_role JWT of 100+ characters', async () => {
    const jwt = `eyJ${'a'.repeat(120)}`;
    vi.stubEnv('SUPABASE_SERVICE_KEY', jwt);

    const { env } = await loadEnv();

    expect(env.supabaseServiceKey).toBe(jwt);
  });

  it('treats blank values (KEY= in .env) as not set', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('STEAM_ID', '');
    vi.stubEnv('MCP_CRON_ENABLED', '');

    const { env } = await loadEnv();

    expect(env).toMatchObject({
      supabaseUrl: undefined,
      steamId: undefined,
      cronEnabled: false,
    });
  });

  it.each([
    ['SUPABASE_URL', 'not-a-url'],
    ['SUPABASE_SERVICE_KEY', 'too-short'],
    ['USER_ID', 'not-a-uuid'],
    ['STEAM_API_KEY', 'ZZZZ'],
    ['STEAM_ID', '1234'],
    ['MCP_CRON_ENABLED', 'yes'],
  ])('rejects an invalid %s', async (key, value) => {
    vi.stubEnv(key, value);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(loadEnv()).rejects.toThrow('process.exit');

    expect(String(consoleError.mock.calls[0]?.[1])).toContain(key);
  });

  it('reports every invalid variable before exiting', async () => {
    vi.stubEnv('MCP_TRANSPORT', 'carrier-pigeon');
    vi.stubEnv('LOG_LEVEL', 'loud');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(loadEnv()).rejects.toThrow('process.exit');

    expect(exit).toHaveBeenCalledWith(1);
    const message = String(consoleError.mock.calls[0]?.[1]);
    expect(message).toContain('MCP_TRANSPORT');
    expect(message).toContain('LOG_LEVEL');
  });
});
