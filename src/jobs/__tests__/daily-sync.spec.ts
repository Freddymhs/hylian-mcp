import { describe, it, expect, vi, afterEach } from 'vitest';
import cron from 'node-cron';
import type { ScheduledTask, TaskOptions } from 'node-cron';
import { err, ok } from '@common/result.js';
import type { Services } from '@services/index.js';
import { DAILY_SYNC_SCHEDULE } from '../constants.js';
import { runDailySync, startDailySync } from '../daily-sync.js';
import { isCronEnabled, startJobs } from '../index.js';
import {
  createFailingSteam,
  createFakeSteam,
  createInMemoryBackend,
  createTestServices,
  sampleSteamGames,
} from '../../__tests__/support/in-memory.js';

interface ScheduledCall {
  expression: string;
  run: () => Promise<void>;
  options: TaskOptions;
}

function createRecordingScheduler() {
  const calls: ScheduledCall[] = [];
  const schedule = (
    expression: string,
    run: () => Promise<void>,
    options: TaskOptions,
  ) => {
    calls.push({ expression, run, options });
    return {} as ScheduledTask;
  };
  return { calls, schedule };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('daily sync schedule', () => {
  it('uses a valid node-cron expression for 04:00 every day', () => {
    expect(DAILY_SYNC_SCHEDULE).toBe('0 4 * * *');
    expect(cron.validate(DAILY_SYNC_SCHEDULE)).toBe(true);
  });

  it('registers the job with the 04:00 schedule and a stderr-safe logger', () => {
    const backend = createInMemoryBackend();
    const { calls, schedule } = createRecordingScheduler();

    startDailySync({
      services: createTestServices(backend, createFakeSteam([])),
      schedule,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.expression).toBe('0 4 * * *');
    expect(calls[0]?.options.noOverlap).toBe(true);
    // A live timer would keep the process running after the MCP client closes stdin.
    expect(calls[0]?.options.unref).toBe(true);

    const consoleSpies = (['log', 'info', 'debug', 'warn'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const taskLogger = calls[0]?.options.logger;
    taskLogger?.info('hello');
    taskLogger?.debug('hello');
    taskLogger?.warn('hello');
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

describe('runDailySync', () => {
  it('syncs the library when the job fires', async () => {
    const backend = createInMemoryBackend();
    const { calls, schedule } = createRecordingScheduler();
    startDailySync({
      services: createTestServices(
        backend,
        createFakeSteam(sampleSteamGames()),
      ),
      schedule,
    });

    await calls[0]?.run();

    expect(backend.state.games.size).toBe(5);
    expect(backend.state.library.size).toBe(5);
  });

  it('does not throw when Steam fails', async () => {
    const backend = createInMemoryBackend();
    const services = createTestServices(
      backend,
      createFailingSteam('Steam rejected the request (HTTP 403)'),
    );

    await expect(runDailySync(services)).resolves.toBeUndefined();
    expect(backend.state.games.size).toBe(0);
  });

  it('does not throw when credentials are missing', async () => {
    const backend = createInMemoryBackend();
    const services: Services = {
      ...createTestServices(backend, createFakeSteam([])),
      library: () =>
        err({
          kind: 'config',
          message: 'Missing environment variable(s): USER_ID',
        }),
    };

    await expect(runDailySync(services)).resolves.toBeUndefined();
  });

  it('does not throw on an unexpected exception', async () => {
    const backend = createInMemoryBackend();
    const services: Services = {
      ...createTestServices(backend, createFakeSteam([])),
      steam: () =>
        ok({
          getOwnedGames: async () => {
            throw new Error('boom');
          },
        }),
    };

    await expect(runDailySync(services)).resolves.toBeUndefined();
  });
});

describe('cron gating', () => {
  it.each([
    [{ nodeEnv: 'production', cronEnabled: false }, true],
    [{ nodeEnv: 'development', cronEnabled: true }, true],
    [{ nodeEnv: 'development', cronEnabled: false }, false],
    [{ nodeEnv: 'test', cronEnabled: false }, false],
  ])('isCronEnabled(%o) = %s', (config, expected) => {
    expect(isCronEnabled(config)).toBe(expected);
  });

  it('mounts the job when enabled', () => {
    const backend = createInMemoryBackend();
    const { calls, schedule } = createRecordingScheduler();

    startJobs({
      services: createTestServices(backend, createFakeSteam([])),
      enabled: true,
      schedule,
    });

    expect(calls.map(({ expression }) => expression)).toEqual([
      '0 4 * * *',
      '0 3 * * 0',
    ]);
  });

  it('does not mount the job when disabled', () => {
    const backend = createInMemoryBackend();
    const { calls, schedule } = createRecordingScheduler();

    startJobs({
      services: createTestServices(backend, createFakeSteam([])),
      enabled: false,
      schedule,
    });

    expect(calls).toHaveLength(0);
  });
});
