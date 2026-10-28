import { err, ok } from './result.js';
import type { Result } from './result.js';

export function tryParseJson(text: string): Result<unknown, SyntaxError> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch (error: unknown) {
    return err(
      error instanceof SyntaxError ? error : new SyntaxError(String(error)),
    );
  }
}
