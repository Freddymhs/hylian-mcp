import { describe, it, expect, afterEach, onTestFinished, vi } from 'vitest';
import cron from 'node-cron';
import type { ScheduledTask, TaskOptions } from 'node-cron';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { err } from '@common/result.js';
import { WEEKLY_BACKUP_SCHEDULE } from '../constants.js';
import {
  exportReviewsBackup,
  formatLocalDate,
  resolveBackupDir,
  runWeeklyBackup,
  startWeeklyBackup,
} from '../weekly-backup.js';
import {
  DB_FAILURE,
  TEST_USER_ID,
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';
import type { InMemoryBackend } from '../../__tests__/support/in-memory.js';

// 2026-10-25 is a Sunday. Built from local components, like the job reads them.
const SUNDAY = new Date(2026, 9, 25, 3, 0, 0);

interface BackupFile {
  version: number;
  exportedAt: string;
  userId: string;
  reviews: {
    id: string;
    text: string;
    autoRank: number | null;
    extractedTags: string[];
    game: { name: string; source: string; steamAppId: number | null } | null;
  }[];
}

async function gameNamed(backend: InMemoryBackend, name: string) {
  const found = await backend.games.findByName(name);
  const game = found.ok ? found.value[0] : undefined;
  if (!game) {
    throw new Error(`test setup: game "${name}" missing`);
  }
  return game;
}

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'hylian-backup-'));
  const backend = createInMemoryBackend();
  await backend.games.upsertSteamGames(
    sampleSteamGames().map(({ appId, name }) => ({
      steamAppId: appId,
      name,
    })),
  );
  const hollowKnight = await gameNamed(backend, 'hollow');
  await backend.reviews.insert({
    gameId: hollowKnight.id,
    text: 'Masterpiece',
    autoRank: 95,
    extractedTags: ['metroidvania'],
  });

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const services = () => createTestServices(backend, createFakeSteam([]));
  const readBackup = async (name: string) =>
    JSON.parse(await readFile(join(dir, name), 'utf8')) as BackupFile;

  return { dir, backend, services, readBackup };
}

describe('weekly backup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportReviewsBackup', () => {
    it('writes reviews-YYYY-MM-DD.json with each review and its game', async () => {
      const { dir, services, readBackup } = await setup();
      const result = await exportReviewsBackup({
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          path: join(dir, 'reviews-2026-10-25.json'),
          reviews: 1,
          removedOldBackups: 0,
        },
      });
      const backup = await readBackup('reviews-2026-10-25.json');
      expect(backup).toMatchObject({
        version: 1,
        userId: TEST_USER_ID,
        exportedAt: SUNDAY.toISOString(),
      });
      expect(backup.reviews).toHaveLength(1);
      expect(backup.reviews[0]).toMatchObject({
        text: 'Masterpiece',
        autoRank: 95,
        extractedTags: ['metroidvania'],
        game: { name: 'Hollow Knight', source: 'steam', steamAppId: 367520 },
      });
    });

    it('leaves the file readable by its owner only', async () => {
      const { dir, services } = await setup();
      await exportReviewsBackup({
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      });

      const { mode } = await stat(join(dir, 'reviews-2026-10-25.json'));

      expect(mode & 0o777).toBe(0o600);
    });

    it('skips soft-deleted reviews', async () => {
      const { dir, backend, services } = await setup();
      const [first] = backend.state.reviews;
      await backend.reviews.softDelete(first!.id, SUNDAY);

      const result = await exportReviewsBackup({
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      });

      expect(result).toMatchObject({ ok: true, value: { reviews: 0 } });
    });

    it('keeps the 12 newest backups and ignores unrelated files', async () => {
      const { dir, services } = await setup();
      const oldNames = Array.from(
        { length: 14 },
        (_, index) =>
          `reviews-2026-0${index < 9 ? 1 : 2}-${String((index % 9) + 10)}.json`,
      );
      await Promise.all(
        oldNames.map((name) => writeFile(join(dir, name), '{}')),
      );
      await writeFile(join(dir, 'notes.txt'), 'mine');

      const result = await exportReviewsBackup({
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      });

      const remaining = (await readdir(dir)).sort();
      const backups = remaining.filter((name) => name.startsWith('reviews-'));
      expect(backups).toHaveLength(12);
      expect(backups).toContain('reviews-2026-10-25.json');
      expect(backups).not.toContain(oldNames[0]);
      expect(remaining).toContain('notes.txt');
      expect(result).toMatchObject({
        ok: true,
        value: { removedOldBackups: 3 },
      });
    });

    it('overwrites the file when run twice the same day, leaving no temp file', async () => {
      const { dir, services } = await setup();
      const deps = {
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      };
      await exportReviewsBackup(deps);
      await exportReviewsBackup(deps);

      expect(await readdir(dir)).toEqual(['reviews-2026-10-25.json']);
    });

    it('creates the backup directory when missing', async () => {
      const { dir, services } = await setup();
      const nested = join(dir, 'a', 'b');

      const result = await exportReviewsBackup({
        services: services(),
        backupDir: nested,
        clock: () => SUNDAY,
      });

      expect(result.ok).toBe(true);
      expect(await readdir(nested)).toHaveLength(1);
    });

    it('can restore the reviews into a database that lost them', async () => {
      const { dir, services, readBackup } = await setup();
      await exportReviewsBackup({
        services: services(),
        backupDir: dir,
        clock: () => SUNDAY,
      });
      const backup = await readBackup('reviews-2026-10-25.json');

      const restored = createInMemoryBackend();
      await restored.games.upsertSteamGames(
        sampleSteamGames().map(({ appId, name }) => ({
          steamAppId: appId,
          name,
        })),
      );
      for (const entry of backup.reviews) {
        const game = await gameNamed(restored, entry.game!.name);
        await restored.reviews.insert({
          gameId: game.id,
          text: entry.text,
          autoRank: entry.autoRank,
          extractedTags: entry.extractedTags,
        });
      }

      expect(restored.state.reviews).toMatchObject([
        { text: 'Masterpiece', autoRank: 95, extractedTags: ['metroidvania'] },
      ]);
    });

    it('fails without writing anything when the database fails', async () => {
      const { dir, backend, services } = await setup();
      const failing = {
        ...services(),
        reviews: () => ({
          ok: true as const,
          value: {
            ...backend.reviews,
            listForBackup: async () => err(DB_FAILURE),
          },
        }),
      };

      const result = await exportReviewsBackup({
        services: failing,
        backupDir: dir,
      });

      expect(result).toMatchObject({ ok: false, error: { kind: 'db' } });
      expect(await readdir(dir)).toEqual([]);
    });

    it('reports a filesystem failure as an io error', async () => {
      const { dir, services } = await setup();
      const blocker = join(dir, 'not-a-dir');
      await writeFile(blocker, 'x');

      const result = await exportReviewsBackup({
        services: services(),
        backupDir: join(blocker, 'backups'),
        clock: () => SUNDAY,
      });

      expect(result).toMatchObject({ ok: false, error: { kind: 'io' } });
    });

    it('requires USER_ID', async () => {
      const { dir, services } = await setup();
      const noUser = {
        ...services(),
        userId: () =>
          err({
            kind: 'config' as const,
            message: 'Missing environment variable(s): USER_ID',
          }),
      };

      const result = await exportReviewsBackup({
        services: noUser,
        backupDir: dir,
      });

      expect(result).toMatchObject({ ok: false, error: { kind: 'config' } });
    });
  });

  describe('runWeeklyBackup', () => {
    it('never throws, even when the backup fails', async () => {
      const { dir, backend, services } = await setup();
      const failing = {
        ...services(),
        reviews: () => ({
          ok: true as const,
          value: {
            ...backend.reviews,
            listForBackup: async () => err(DB_FAILURE),
          },
        }),
      };

      await expect(
        runWeeklyBackup({ services: failing, backupDir: dir }),
      ).resolves.toBeUndefined();
    });
  });

  describe('scheduling', () => {
    it('uses a valid expression for 03:00 on Sundays', () => {
      expect(WEEKLY_BACKUP_SCHEDULE).toBe('0 3 * * 0');
      expect(cron.validate(WEEKLY_BACKUP_SCHEDULE)).toBe(true);
    });

    it('registers an unref-ed, non-overlapping task', async () => {
      const { services } = await setup();
      const calls: { expression: string; options: TaskOptions }[] = [];

      startWeeklyBackup({
        services: services(),
        schedule: (expression, _run, options) => {
          calls.push({ expression, options });
          return {} as ScheduledTask;
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.expression).toBe('0 3 * * 0');
      expect(calls[0]?.options).toMatchObject({ unref: true, noOverlap: true });
    });
  });

  describe('paths', () => {
    it('honours XDG_DATA_HOME', () => {
      expect(resolveBackupDir('/data/xdg')).toBe(
        '/data/xdg/hylian-mcp/backups',
      );
    });

    it('falls back to ~/.hylian-mcp/backups', () => {
      expect(resolveBackupDir(undefined)).toBe(
        join(homedir(), '.hylian-mcp', 'backups'),
      );
    });

    it('formats the local calendar date', () => {
      expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
      expect(formatLocalDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
    });
  });
});
