import type { PostgrestError } from '@supabase/supabase-js';
import { logger } from '@common/logger.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';

export interface DbError {
  readonly operation: string;
  readonly message: string;
  readonly code?: string;
}

interface QueryOutcome<T> {
  data: T | null;
  error: PostgrestError | null;
}

function toDbError(operation: string, error: PostgrestError): DbError {
  const { code, message, details, hint } = error;
  logger.error({ operation, code, details, hint }, `Supabase: ${message}`);
  return { operation, message, code };
}

export function unwrapRows<T>(
  operation: string,
  { data, error }: QueryOutcome<T[]>,
): Result<T[], DbError> {
  return error ? err(toDbError(operation, error)) : ok(data ?? []);
}

export function unwrapRow<T>(
  operation: string,
  { data, error }: QueryOutcome<T>,
): Result<T, DbError> {
  if (error) {
    return err(toDbError(operation, error));
  }
  if (data === null) {
    return err({ operation, message: 'Query returned no row' });
  }
  return ok(data);
}

export function unwrapVoid(
  operation: string,
  { error }: { error: PostgrestError | null },
): Result<void, DbError> {
  return error ? err(toDbError(operation, error)) : ok(undefined);
}
