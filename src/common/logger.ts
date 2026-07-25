import pino from 'pino';
import { env } from '@config/env.js';

// CRITICAL: In stdio mode, stdout is the MCP protocol channel.
// ALL logging MUST go to stderr (file descriptor 2) to avoid
// corrupting JSON-RPC messages. This applies to ANY MCP client,
// not just Claude Code.
export const logger = pino(
  {
    level: env.logLevel,
    ...(env.nodeEnv !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, destination: 2 },
      },
    }),
  },
  env.nodeEnv === 'production' ? pino.destination(2) : undefined,
);
