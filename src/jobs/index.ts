import { env } from '@config/env.js';
import { logger } from '@common/logger.js';
import type { Services } from '@services/container.js';
import { startDailySync } from './daily-sync.js';
import { startWeeklyBackup } from './weekly-backup.js';
import type { ScheduleFn } from './daily-sync.js';

export interface JobsDeps {
  services: Services;
  enabled?: boolean;
  schedule?: ScheduleFn;
}

// Jobs run in production, or in dev when MCP_CRON_ENABLED=true.
export function isCronEnabled({
  nodeEnv,
  cronEnabled,
}: {
  nodeEnv: string;
  cronEnabled: boolean;
}): boolean {
  return nodeEnv === 'production' || cronEnabled;
}

export function startJobs({
  services,
  enabled = isCronEnabled(env),
  schedule,
}: JobsDeps): void {
  if (!enabled) {
    logger.debug(
      'Cron jobs disabled (set MCP_CRON_ENABLED=true to enable in dev)',
    );
    return;
  }
  startDailySync({ services, schedule });
  startWeeklyBackup({ services, schedule });
  logger.info('Cron jobs scheduled: daily-sync, weekly-backup');
}

export { runDailySync, startDailySync } from './daily-sync.js';
export { runWeeklyBackup, startWeeklyBackup } from './weekly-backup.js';
