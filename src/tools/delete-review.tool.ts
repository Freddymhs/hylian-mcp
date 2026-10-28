import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import type { Services } from '@services/container.js';
import { refreshProfile } from './refresh-profile.js';

export function registerDeleteReviewTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'delete_review',
    {
      title: 'Delete Review',
      description:
        "Deletes one of the user's reviews (soft delete: it stops counting for the taste profile and for every listing). Ask the user to confirm first. Fails if the review does not exist or was already deleted. Returns { reviewId, deleted }.",
      inputSchema: {
        reviewId: z.string().uuid().describe('Id returned by review_game'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ reviewId }) => {
      const reviews = services.reviews();
      if (!reviews.ok) {
        return toolError(reviews.error.message);
      }

      const deleted = await reviews.value.softDelete(
        reviewId,
        services.clock(),
      );
      if (!deleted.ok) {
        return toolError(
          `Could not delete the review: ${deleted.error.message}`,
        );
      }
      if (deleted.value === null) {
        return toolError(`Review ${reviewId} not found or already deleted`);
      }

      await refreshProfile(services);
      return toolSuccess(JSON.stringify({ reviewId, deleted: true }));
    },
  );
}
