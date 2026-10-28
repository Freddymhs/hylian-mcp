import { request } from 'undici';
import type { Dispatcher } from 'undici';
import { logger } from '@common/logger.js';
import { tryParseJson } from '@common/json.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import {
  STEAM_REQUEST_TIMEOUT_MS,
  STEAM_RETRY_DELAYS_MS,
} from './constants.js';
import type { SteamError } from './types.js';

export interface HttpOptions {
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  dispatcher?: Dispatcher;
}

export interface RawResponse {
  status: number;
  body: string;
}

export type HttpGet = (url: string) => Promise<Result<RawResponse, SteamError>>;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isServerError = (status: number) => status >= 500;

export const isSuccess = (status: number) => status >= 200 && status < 300;

export function parseJson(text: string): Result<unknown, SteamError> {
  const parsed = tryParseJson(text);
  return parsed.ok
    ? parsed
    : err({
        kind: 'invalid_response',
        message: 'Steam returned a body that is not valid JSON',
      });
}

// GET with a per-request timeout and exponential backoff on 5xx.
// URLs may carry an API key: they never reach a log line or an error message.
export function createRetryingGet({
  timeoutMs = STEAM_REQUEST_TIMEOUT_MS,
  retryDelaysMs = STEAM_RETRY_DELAYS_MS,
  sleep = defaultSleep,
  dispatcher,
}: HttpOptions = {}): HttpGet {
  async function requestOnce(
    url: string,
  ): Promise<Result<RawResponse, SteamError>> {
    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
        ...(dispatcher && { dispatcher }),
      });
      return ok({ status: statusCode, body: await body.text() });
    } catch (error: unknown) {
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      logger.warn({ isTimeout }, 'Steam request failed before a response');
      return err(
        isTimeout
          ? {
              kind: 'timeout',
              message: `Steam did not answer within ${timeoutMs} ms`,
            }
          : { kind: 'network', message: 'Could not reach Steam' },
      );
    }
  }

  async function requestWithRetry(
    url: string,
    attempt: number,
  ): Promise<Result<RawResponse, SteamError>> {
    const outcome = await requestOnce(url);
    if (!outcome.ok) {
      return outcome;
    }
    const { status } = outcome.value;
    const retryDelay = retryDelaysMs[attempt];
    if (isServerError(status) && retryDelay !== undefined) {
      logger.warn({ status, attempt: attempt + 1 }, 'Steam 5xx, retrying');
      await sleep(retryDelay);
      return requestWithRetry(url, attempt + 1);
    }
    return outcome;
  }

  return (url) => requestWithRetry(url, 0);
}
