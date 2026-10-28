import { describe, it, expect } from 'vitest';
import { createReviewRepository } from '../reviews.repository.js';
import { TEST_USER_ID, createFakeSupabase } from './fake-postgrest.js';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const REVIEW_ID = 'c1b2f3a4-0000-4000-8000-000000000001';

describe('review repository (FASE_2)', () => {
  describe('update', () => {
    it('patches only the given fields, scoped to the user and active reviews', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [
          {
            id: REVIEW_ID,
            text: 'Even better on replay',
            auto_rank: 98,
            extracted_tags: ['metroidvania'],
            updated_at: '2026-10-24T12:00:00+00:00',
            games: { name: 'Hollow Knight' },
          },
        ],
      }));

      const result = await createReviewRepository(client, TEST_USER_ID).update(
        REVIEW_ID,
        { autoRank: 98 },
        NOW,
      );

      const [request] = requests;
      const { searchParams } = request!.url;
      expect(request?.method).toBe('PATCH');
      expect(searchParams.get('id')).toBe(`eq.${REVIEW_ID}`);
      expect(searchParams.get('user_id')).toBe(`eq.${TEST_USER_ID}`);
      expect(searchParams.get('deleted_at')).toBe('is.null');
      expect(request?.body).toEqual({
        auto_rank: 98,
        updated_at: '2026-10-24T12:00:00.000Z',
      });
      expect(result).toEqual({
        ok: true,
        value: {
          id: REVIEW_ID,
          gameName: 'Hollow Knight',
          text: 'Even better on replay',
          autoRank: 98,
          extractedTags: ['metroidvania'],
          updatedAt: '2026-10-24T12:00:00+00:00',
        },
      });
    });

    it('returns null when no active review of the user matches', async () => {
      const { client } = createFakeSupabase(() => ({ status: 200, body: [] }));

      const result = await createReviewRepository(client, TEST_USER_ID).update(
        REVIEW_ID,
        { text: 'x' },
        NOW,
      );

      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns a DbError on a rejected write', async () => {
      const { client } = createFakeSupabase(() => ({
        status: 400,
        body: {
          code: '23514',
          details: null,
          hint: null,
          message:
            'new row violates check constraint "reviews_auto_rank_check"',
        },
      }));

      const result = await createReviewRepository(client, TEST_USER_ID).update(
        REVIEW_ID,
        { autoRank: 101 },
        NOW,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { operation: 'reviews.update', code: '23514' },
      });
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at on the active review of the user', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [{ id: REVIEW_ID }],
      }));

      const result = await createReviewRepository(
        client,
        TEST_USER_ID,
      ).softDelete(REVIEW_ID, NOW);

      const [request] = requests;
      expect(request?.method).toBe('PATCH');
      expect(request?.url.searchParams.get('deleted_at')).toBe('is.null');
      expect(request?.url.searchParams.get('user_id')).toBe(
        `eq.${TEST_USER_ID}`,
      );
      expect(request?.body).toEqual({ deleted_at: '2026-10-24T12:00:00.000Z' });
      expect(result).toEqual({ ok: true, value: { id: REVIEW_ID } });
    });

    it("returns null when already deleted or not the user's", async () => {
      const { client } = createFakeSupabase(() => ({ status: 200, body: [] }));

      const result = await createReviewRepository(
        client,
        TEST_USER_ID,
      ).softDelete(REVIEW_ID, NOW);

      expect(result).toEqual({ ok: true, value: null });
    });
  });

  describe('listTagSamples', () => {
    it('reads active reviews of the user, mapping null tags to empty', async () => {
      const { client, requests } = createFakeSupabase(() => ({
        status: 200,
        body: [
          { auto_rank: 90, extracted_tags: ['rpg'] },
          { auto_rank: null, extracted_tags: null },
        ],
      }));

      const result = await createReviewRepository(
        client,
        TEST_USER_ID,
      ).listTagSamples();

      const { searchParams } = requests[0]!.url;
      expect(searchParams.get('user_id')).toBe(`eq.${TEST_USER_ID}`);
      expect(searchParams.get('deleted_at')).toBe('is.null');
      expect(result).toEqual({
        ok: true,
        value: [
          { autoRank: 90, extractedTags: ['rpg'] },
          { autoRank: null, extractedTags: [] },
        ],
      });
    });

    it('pages through more than 1000 reviews', async () => {
      const page = (size: number) =>
        Array.from({ length: size }, () => ({
          auto_rank: 50,
          extracted_tags: [],
        }));
      const { client, requests } = createFakeSupabase(({ url }) => ({
        status: 200,
        body: page(url.searchParams.get('offset') === '0' ? 1000 : 5),
      }));

      const result = await createReviewRepository(
        client,
        TEST_USER_ID,
      ).listTagSamples();

      expect(requests).toHaveLength(2);
      expect(result.ok && result.value).toHaveLength(1005);
    });
  });
});
