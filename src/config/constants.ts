export const SERVER_NAME = 'hylian-mcp';
export const SERVER_VERSION = '0.1.0';

export const ENV_KEYS = {
  NODE_ENV: 'NODE_ENV',
  MCP_TRANSPORT: 'MCP_TRANSPORT',
  PORT: 'PORT',
  LOG_LEVEL: 'LOG_LEVEL',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

export const TRANSPORT_STDIO = 'stdio' as const;
export const TRANSPORT_HTTP = 'http' as const;
