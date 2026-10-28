import cron from 'node-cron';
import type { ScheduledTask, TaskOptions } from 'node-cron';
import { logger } from '@common/logger.js';
import { syncLibrary } from '@services/library-sync.js';
import type { Services } from '@services/container.js';
import { cronLogger } from './cron-logger.js';
import { DAILY_SYNC_SCHEDULE, DAILY_SYNC_TASK_NAME } from './constants.js';

export type ScheduleFn = (
  expression: string,
  run: () => Promise<void>,
  options: TaskOptions,
) => ScheduledTask;

export interface DailySyncDeps {
  services: Services;
  schedule?: ScheduleFn;
}

// Runs the same use case as the sync_library tool, directly (not through MCP).
// A failing run is logged at fatal level but never throws: it must not kill the server.
export async function runDailySync(services: Services): Promise<void> {
  logger.info('Daily sync: start');
  try {
    const steam = services.steam();
    const games = services.games();
    const library = services.library();
    if (!steam.ok || !games.ok || !library.ok) {
      const failed = [steam, games, library].find((dep) => !dep.ok);
      logger.fatal(
        { reason: failed && !failed.ok ? failed.error.message : 'unknown' },
        'Daily sync: not configured',
      );
      return;
    }

    const summary = await syncLibrary({
      steam: steam.value,
      games: games.value,
      library: library.value,
    });
    if (summary.ok) {
      logger.info(summary.value, 'Daily sync: done');
    } else {
      logger.fatal({ reason: summary.error.message }, 'Daily sync: failed');
    }
  } catch (error: unknown) {
    logger.fatal(error, 'Daily sync: unexpected error');
  }
}

export function startDailySync({
  services,
  schedule = cron.schedule,
}: DailySyncDeps): ScheduledTask {
  return schedule(DAILY_SYNC_SCHEDULE, () => runDailySync(services), {
    name: DAILY_SYNC_TASK_NAME,
    logger: cronLogger,
    noOverlap: true,
    unref: true,
  });
}
