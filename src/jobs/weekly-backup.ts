import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from '@config/env.js';
import { logger } from '@common/logger.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { fromDbError } from '@services/errors.js';
import type { ServiceError } from '@services/errors.js';
import type { Services } from '@services/container.js';
import { cronLogger } from './cron-logger.js';
import type { ScheduleFn } from './daily-sync.js';
import {
  BACKUP_DIR_MODE,
  BACKUP_FILE_EXTENSION,
  BACKUP_FILE_MODE,
  BACKUP_FILE_PATTERN,
  BACKUP_FILE_PREFIX,
  BACKUP_FORMAT_VERSION,
  BACKUP_HOME_DIR_NAME,
  BACKUP_RETENTION,
  BACKUP_SUBDIR,
  BACKUP_XDG_DIR_NAME,
  WEEKLY_BACKUP_SCHEDULE,
  WEEKLY_BACKUP_TASK_NAME,
} from './constants.js';

export interface BackupSummary {
  path: string;
  reviews: number;
  removedOldBackups: number;
}

export interface WeeklyBackupDeps {
  services: Services;
  backupDir?: string;
  clock?: () => Date;
}

// $XDG_DATA_HOME/hylian-mcp/backups when XDG is set, otherwise ~/.hylian-mcp/backups.
export function resolveBackupDir(xdgDataHome: string | undefined): string {
  return xdgDataHome
    ? join(xdgDataHome, BACKUP_XDG_DIR_NAME, BACKUP_SUBDIR)
    : join(homedir(), BACKUP_HOME_DIR_NAME, BACKUP_SUBDIR);
}

// Local calendar date: a 03:00 Sunday run must not be filed under Saturday because of UTC.
export function formatLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function removeOldBackups(dir: string): Promise<number> {
  const names = (await readdir(dir)).filter((name) =>
    BACKUP_FILE_PATTERN.test(name),
  );
  // The date is in the name, so the lexical order is the chronological one.
  const expired = names.sort().reverse().slice(BACKUP_RETENTION);
  await Promise.all(expired.map((name) => rm(join(dir, name))));
  return expired.length;
}

// Restore (manual): each entry of `reviews` carries the review and its game. Re-create the game if it is
// gone (steam: sync_library; manual: add_manual_game) and insert the review with its text, rank and tags.
export async function exportReviewsBackup({
  services,
  backupDir = resolveBackupDir(env.xdgDataHome),
  clock = () => new Date(),
}: WeeklyBackupDeps): Promise<Result<BackupSummary, ServiceError>> {
  const reviews = services.reviews();
  if (!reviews.ok) {
    return err(reviews.error);
  }
  const userId = services.userId();
  if (!userId.ok) {
    return err(userId.error);
  }

  const exported = await reviews.value.listForBackup();
  if (!exported.ok) {
    return err(fromDbError(exported.error));
  }

  const now = clock();
  const finalPath = join(
    backupDir,
    `${BACKUP_FILE_PREFIX}${formatLocalDate(now)}${BACKUP_FILE_EXTENSION}`,
  );
  const tempPath = `${finalPath}.tmp`;
  const document = {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    userId: userId.value,
    reviews: exported.value,
  };

  try {
    await mkdir(backupDir, { recursive: true, mode: BACKUP_DIR_MODE });
    // Written aside and renamed: a crash never leaves a half-written file under the final name.
    await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, {
      mode: BACKUP_FILE_MODE,
    });
    await rename(tempPath, finalPath);
    const removedOldBackups = await removeOldBackups(backupDir);
    return ok({
      path: finalPath,
      reviews: exported.value.length,
      removedOldBackups,
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return err({
      kind: 'io',
      message: `Could not write the backup: ${reason}`,
    });
  }
}

// Never throws: a failed backup is logged, the server keeps running.
export async function runWeeklyBackup(deps: WeeklyBackupDeps): Promise<void> {
  logger.info('Weekly backup: start');
  try {
    const summary = await exportReviewsBackup(deps);
    if (summary.ok) {
      logger.info(summary.value, 'Weekly backup: done');
    } else {
      logger.error({ reason: summary.error.message }, 'Weekly backup: failed');
    }
  } catch (error: unknown) {
    logger.error(error, 'Weekly backup: unexpected error');
  }
}

export function startWeeklyBackup({
  services,
  schedule = cron.schedule,
}: {
  services: Services;
  schedule?: ScheduleFn;
}): ScheduledTask {
  return schedule(WEEKLY_BACKUP_SCHEDULE, () => runWeeklyBackup({ services }), {
    name: WEEKLY_BACKUP_TASK_NAME,
    logger: cronLogger,
    noOverlap: true,
    unref: true,
  });
}
