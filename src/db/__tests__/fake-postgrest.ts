import { createSupabaseClient } from '../supabase.js';
import type { AppSupabaseClient } from '../supabase.js';

export const TEST_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
export const TEST_SERVICE_KEY = 'sb_secret_test_key_not_real';
export const TEST_USER_ID = '3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11';

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export interface FakeResponse {
  status: number;
  body: unknown;
}

export type PostgrestResponder = (request: RecordedRequest) => FakeResponse;

// PostgREST answers JSON; errors are `{ code, details, hint, message }` with a 4xx status.
export function createFakeSupabase(respond: PostgrestResponder): {
  client: AppSupabaseClient;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const raw = new Request(input, init);
    const text = await raw.text();
    const recorded: RecordedRequest = {
      method: raw.method,
      url: new URL(raw.url),
      headers: raw.headers,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    requests.push(recorded);
    const { status, body } = respond(recorded);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createSupabaseClient(
    { url: TEST_SUPABASE_URL, serviceKey: TEST_SERVICE_KEY },
    { fetch: fakeFetch },
  );
  return { client, requests };
}

// PostgREST answers PGRST205 when the table is not in its schema cache (schema.sql never ran).
export const TABLE_NOT_FOUND_ERROR = {
  code: 'PGRST205',
  details: null,
  hint: null,
  message: "Could not find the table 'public.games' in the schema cache",
};
