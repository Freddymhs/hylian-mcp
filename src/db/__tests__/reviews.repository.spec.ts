import { describe, it, expect } from 'vitest';
import { createReviewRepository } from '../reviews.repository.js';
import { TEST_USER_ID, createFakeSupabase } from './fake-postgrest.js';

describe('review repository', () => {
  it('inserts the review for the configured user and returns its id', async () => {
    const { client, requests } = createFakeSupabase(() => ({
      status: 201,
      body: { id: 'c1b2f3a4-0000-4000-8000-000000000001' },
    }));

    const result = await createReviewRepository(client, TEST_USER_ID).insert({
      gameId: 'uuid-1',
      text: 'Masterpiece',
      autoRank: 95,
      extractedTags: ['metroidvania'],
    });

    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url.pathname).toBe('/rest/v1/reviews');
    expect(requests[0]?.headers.get('accept')).toBe(
      'application/vnd.pgrst.object+json',
    );
    expect(requests[0]?.body).toEqual({
      user_id: TEST_USER_ID,
      game_id: 'uuid-1',
      text: 'Masterpiece',
      auto_rank: 95,
      extracted_tags: ['metroidvania'],
    });
    expect(result).toEqual({
      ok: true,
      value: { id: 'c1b2f3a4-0000-4000-8000-000000000001' },
    });
  });

  it('returns a DbError when the CHECK constraint rejects the rank', async () => {
    const { client } = createFakeSupabase(() => ({
      status: 400,
      body: {
        code: '23514',
        details: null,
        hint: null,
        message: 'new row violates check constraint "reviews_auto_rank_check"',
      },
    }));

    const result = await createReviewRepository(client, TEST_USER_ID).insert({
      gameId: 'uuid-1',
      text: 'x',
      autoRank: 101,
      extractedTags: [],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { operation: 'reviews.insert', code: '23514' },
    });
  });
});
