import { logger } from '@common/logger.js';

// node-cron's default logger writes info/debug with console.info/console.debug (stdout),
// which would corrupt the MCP JSON-RPC channel in stdio mode. Route everything to pino (stderr).
export const cronLogger = {
  info: (message: string) => logger.info(message),
  warn: (message: string) => logger.warn(message),
  error: (message: string | Error, error?: Error) =>
    logger.error({ err: error ?? message }, String(message)),
  debug: (message: string | Error) => logger.debug(String(message)),
};
