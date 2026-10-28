import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import type { Services } from '@services/container.js';
import { MAX_AUTO_RANK, MAX_REVIEW_TAGS, MIN_AUTO_RANK } from './constants.js';
import { refreshProfile } from './refresh-profile.js';

export function registerEditReviewTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'edit_review',
    {
      title: 'Edit Review',
      description:
        'Updates a review the user wrote: its text, its 0-100 rank and/or its tags. Only the fields provided change; at least one is required. Refreshes updated_at and the taste profile. Returns { reviewId, gameName, textLength, autoRank, extractedTags, updatedAt }.',
      inputSchema: {
        reviewId: z.string().uuid().describe('Id returned by review_game'),
        text: z.string().trim().min(1).optional().describe('New review text'),
        autoRank: z
          .number()
          .int()
          .min(MIN_AUTO_RANK)
          .max(MAX_AUTO_RANK)
          .optional()
          .describe('New score from 0 to 100'),
        extractedTags: z
          .array(z.string().trim().min(1))
          .max(MAX_REVIEW_TAGS)
          .optional()
          .describe('Replaces the review tags'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ reviewId, text, autoRank, extractedTags }) => {
      const hasChanges =
        text !== undefined ||
        autoRank !== undefined ||
        extractedTags !== undefined;
      if (!hasChanges) {
        return toolError(
          'Nothing to update: provide text, autoRank or extractedTags',
        );
      }
      const reviews = services.reviews();
      if (!reviews.ok) {
        return toolError(reviews.error.message);
      }

      const updated = await reviews.value.update(
        reviewId,
        { text, autoRank, extractedTags },
        services.clock(),
      );
      if (!updated.ok) {
        return toolError(
          `Could not update the review: ${updated.error.message}`,
        );
      }
      if (updated.value === null) {
        return toolError(`Review ${reviewId} not found`);
      }

      await refreshProfile(services);
      const review = updated.value;
      return toolSuccess(
        JSON.stringify({
          reviewId: review.id,
          gameName: review.gameName,
          textLength: review.text.length,
          autoRank: review.autoRank,
          extractedTags: review.extractedTags,
          updatedAt: review.updatedAt,
        }),
      );
    },
  );
}
