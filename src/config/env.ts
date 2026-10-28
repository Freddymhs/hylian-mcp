import { z } from 'zod';
import {
  BOOLEAN_STRINGS,
  DEFAULT_CRON_ENABLED,
  DEFAULT_LOG_LEVEL,
  DEFAULT_NODE_ENV,
  DEFAULT_PORT,
  DEFAULT_TRANSPORT,
  ENV_KEYS,
  LOG_LEVELS,
  NODE_ENVS,
  STEAM_API_KEY_PATTERN,
  STEAM_ID_PATTERN,
  SUPABASE_LEGACY_KEY_MIN_LENGTH,
  SUPABASE_SECRET_KEY_PREFIX,
  TRANSPORTS,
} from './constants.js';

// `KEY=` in a .env file arrives as '' — treat it as "not set".
function optionalNonEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
}

// Legacy service_role keys are long JWTs; the newer `sb_secret_...` keys are shorter.
function isSupabaseServiceKey(value: string): boolean {
  const isNewFormat = value.startsWith(SUPABASE_SECRET_KEY_PREFIX);
  const isLegacyJwt = value.length >= SUPABASE_LEGACY_KEY_MIN_LENGTH;
  return isNewFormat || isLegacyJwt;
}

const schema = z.object({
  [ENV_KEYS.NODE_ENV]: z.enum(NODE_ENVS).default(DEFAULT_NODE_ENV),
  [ENV_KEYS.MCP_TRANSPORT]: z.enum(TRANSPORTS).default(DEFAULT_TRANSPORT),
  [ENV_KEYS.PORT]: z.coerce.number().default(DEFAULT_PORT),
  [ENV_KEYS.LOG_LEVEL]: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL),
  [ENV_KEYS.SUPABASE_URL]: optionalNonEmpty(z.string().url()),
  [ENV_KEYS.SUPABASE_SERVICE_KEY]: optionalNonEmpty(
    z
      .string()
      .refine(
        isSupabaseServiceKey,
        `must be a service_role JWT (>= ${SUPABASE_LEGACY_KEY_MIN_LENGTH} chars) or an ${SUPABASE_SECRET_KEY_PREFIX}... key`,
      ),
  ),
  [ENV_KEYS.USER_ID]: optionalNonEmpty(z.string().uuid()),
  [ENV_KEYS.STEAM_API_KEY]: optionalNonEmpty(
    z.string().regex(STEAM_API_KEY_PATTERN, 'must be 32 hex characters'),
  ),
  [ENV_KEYS.STEAM_ID]: optionalNonEmpty(
    z.string().regex(STEAM_ID_PATTERN, 'must be a 17-digit SteamID64'),
  ),
  [ENV_KEYS.XDG_DATA_HOME]: optionalNonEmpty(z.string()),
  [ENV_KEYS.MCP_CRON_ENABLED]: z
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(BOOLEAN_STRINGS).default(DEFAULT_CRON_ENABLED),
    )
    .transform((value) => value === 'true'),
});

export type ParsedEnv = z.infer<typeof schema>;

const result = schema.safeParse(process.env);

if (!result.success) {
  // stderr is safe — stdout is reserved for MCP protocol in stdio mode
  const issues = result.error.issues
    .map(({ path, message }) => `${path.join('.')}: ${message}`)
    .join('; ');
  console.error('Config validation error:', issues);
  process.exit(1);
}

const parsed = result.data;

export const env = {
  nodeEnv: parsed.NODE_ENV,
  transport: parsed.MCP_TRANSPORT,
  port: parsed.PORT,
  logLevel: parsed.LOG_LEVEL,
  supabaseUrl: parsed.SUPABASE_URL,
  supabaseServiceKey: parsed.SUPABASE_SERVICE_KEY,
  userId: parsed.USER_ID,
  steamApiKey: parsed.STEAM_API_KEY,
  steamId: parsed.STEAM_ID,
  cronEnabled: parsed.MCP_CRON_ENABLED,
  xdgDataHome: parsed.XDG_DATA_HOME,
} as const;
