import type { DbError } from '@db/errors.js';
import type { SteamError } from './steam/types.js';

export type ServiceErrorKind =
  | 'config'
  | 'io'
  | 'steam'
  | 'db'
  | 'not_found'
  | 'ambiguous';

export interface ServiceError {
  readonly kind: ServiceErrorKind;
  readonly message: string;
}

export function fromDbError({ operation, message }: DbError): ServiceError {
  return { kind: 'db', message: `Database error (${operation}): ${message}` };
}

export function fromSteamError({ message }: SteamError): ServiceError {
  return { kind: 'steam', message: `Steam error: ${message}` };
}
