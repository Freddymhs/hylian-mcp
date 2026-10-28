import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import { resolveGameByName } from '@services/game-lookup.js';
import type { Services } from '@services/container.js';
import {
  MAX_AUTO_RANK,
  MAX_GAME_NAME_LENGTH,
  MAX_REVIEW_TAGS,
  MIN_AUTO_RANK,
} from './constants.js';
import { refreshProfile } from './refresh-profile.js';

export function registerReviewGameTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'review_game',
    {
      title: 'Review Game',
      description:
        "Saves the user's written review of a game from their catalog (matched by name, case-insensitive). Optionally stores a 0-100 rank and tags extracted from the text. Each call creates a new review. Returns { reviewId, gameName, textLength, autoRank }.",
      inputSchema: {
        gameName: z
          .string()
          .trim()
          .min(1, 'Game name is required')
          .max(MAX_GAME_NAME_LENGTH)
          .describe('Name (or unique part of the name) of the game to review'),
        text: z
          .string()
          .trim()
          .min(1, 'Review text is required')
          .describe("The review, in the user's words"),
        autoRank: z
          .number()
          .int()
          .min(MIN_AUTO_RANK)
          .max(MAX_AUTO_RANK)
          .optional()
          .describe('Optional score from 0 to 100 inferred from the review'),
        extractedTags: z
          .array(z.string().trim().min(1))
          .max(MAX_REVIEW_TAGS)
          .optional()
          .describe('Optional genre/mechanic tags extracted from the review'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ gameName, text, autoRank, extractedTags }) => {
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }
      const reviews = services.reviews();
      if (!reviews.ok) {
        return toolError(reviews.error.message);
      }

      const game = await resolveGameByName(games.value, gameName);
      if (!game.ok) {
        return toolError(game.error.message);
      }

      const rank = autoRank ?? null;
      const saved = await reviews.value.insert({
        gameId: game.value.id,
        text,
        autoRank: rank,
        extractedTags: extractedTags ?? [],
      });
      if (!saved.ok) {
        return toolError(`Could not save the review: ${saved.error.message}`);
      }

      await refreshProfile(services);
      return toolSuccess(
        JSON.stringify({
          reviewId: saved.value.id,
          gameName: game.value.name,
          textLength: text.length,
          autoRank: rank,
        }),
      );
    },
  );
}
