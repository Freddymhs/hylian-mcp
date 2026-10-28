import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@config/env.js';
import { ENV_KEYS } from '@config/constants.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { lazy } from '@common/lazy.js';
import type { Database } from './types.js';
import type { DbError } from './errors.js';

export type AppSupabaseClient = SupabaseClient<Database>;

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

export interface SupabaseClientOptions {
  fetch?: typeof fetch;
}

// Single-user server: no sessions to persist or refresh, service_role bypasses RLS.
export function createSupabaseClient(
  { url, serviceKey }: SupabaseConfig,
  { fetch: customFetch }: SupabaseClientOptions = {},
): AppSupabaseClient {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(customFetch && { global: { fetch: customFetch } }),
  });
}

function createFromEnv(): Result<AppSupabaseClient, DbError> {
  const { supabaseUrl, supabaseServiceKey } = env;
  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [
      !supabaseUrl && ENV_KEYS.SUPABASE_URL,
      !supabaseServiceKey && ENV_KEYS.SUPABASE_SERVICE_KEY,
    ].filter(Boolean);
    return err({
      operation: 'supabase-client',
      message: `Missing environment variable(s): ${missing.join(', ')}`,
    });
  }
  return ok(
    createSupabaseClient({ url: supabaseUrl, serviceKey: supabaseServiceKey }),
  );
}

export const getSupabaseClient = lazy(createFromEnv);
