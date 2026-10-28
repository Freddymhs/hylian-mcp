export const SERVER_NAME = 'hylian-mcp';
export const SERVER_VERSION = '0.1.0';

export const ENV_KEYS = {
  NODE_ENV: 'NODE_ENV',
  MCP_TRANSPORT: 'MCP_TRANSPORT',
  PORT: 'PORT',
  LOG_LEVEL: 'LOG_LEVEL',
  SUPABASE_URL: 'SUPABASE_URL',
  SUPABASE_SERVICE_KEY: 'SUPABASE_SERVICE_KEY',
  USER_ID: 'USER_ID',
  STEAM_API_KEY: 'STEAM_API_KEY',
  STEAM_ID: 'STEAM_ID',
  MCP_CRON_ENABLED: 'MCP_CRON_ENABLED',
  XDG_DATA_HOME: 'XDG_DATA_HOME',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

export const TRANSPORT_STDIO = 'stdio' as const;
export const TRANSPORT_HTTP = 'http' as const;

export const TRANSPORTS = [TRANSPORT_STDIO, TRANSPORT_HTTP] as const;
export const NODE_ENVS = ['development', 'production', 'test'] as const;
export const LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
] as const;

export const DEFAULT_TRANSPORT = TRANSPORT_STDIO;
export const DEFAULT_NODE_ENV = 'development';
export const DEFAULT_PORT = 3000;
export const DEFAULT_LOG_LEVEL = 'info';

export const STEAM_API_KEY_PATTERN = /^[0-9a-fA-F]{32}$/;
export const STEAM_ID_PATTERN = /^\d{17}$/;

export const SUPABASE_LEGACY_KEY_MIN_LENGTH = 100;
export const SUPABASE_SECRET_KEY_PREFIX = 'sb_secret_';

export const BOOLEAN_STRINGS = ['true', 'false'] as const;
export const DEFAULT_CRON_ENABLED = 'false';
