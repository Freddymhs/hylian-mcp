import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import {
  DEFAULT_RECOMMENDATIONS,
  MAX_RECOMMENDATIONS,
  recommendPurchases,
} from '@services/index.js';
import type { Services } from '@services/container.js';
import { MAX_CRITERIA_LENGTH } from './constants.js';

export function registerRecommendPurchaseTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'recommend_purchase',
    {
      title: 'Recommend Purchase',
      description:
        "Recommends games to buy that match the user's taste profile (derived from their tagged reviews) and are not in their library. Searches the Steam Store, so it needs network and can take several seconds. score is 0-100 relative to the best candidate of this run, not an absolute match. Needs reviews with extractedTags. Games added with add_manual_game are never recommended. Returns { recommendations: [{ gameName, steamAppId, score, matchedTags, priceUSD, storeUrl }], evaluated, skipped, warnings }.",
      inputSchema: {
        criteria: z
          .string()
          .trim()
          .min(1)
          .max(MAX_CRITERIA_LENGTH)
          .optional()
          .describe(
            'Free-text focus (e.g. "co-op", "metroidvania"). When given, candidates are searched for this instead of the top profile tags; ranking still uses the profile.',
          ),
        maxPrice: z
          .number()
          .nonnegative()
          .optional()
          .describe(
            'Highest acceptable price in USD; games with unknown price are excluded',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_RECOMMENDATIONS)
          .default(DEFAULT_RECOMMENDATIONS)
          .describe('How many recommendations to return'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ criteria, maxPrice, limit }) => {
      const profile = services.profile();
      if (!profile.ok) {
        return toolError(profile.error.message);
      }
      const providers = services.providers();
      if (!providers.ok) {
        return toolError(providers.error.message);
      }
      const library = services.library();
      if (!library.ok) {
        return toolError(library.error.message);
      }
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }

      const outcome = await recommendPurchases(
        {
          profile: profile.value,
          providers: providers.value,
          library: library.value,
          games: games.value,
        },
        { criteria, maxPrice, limit },
      );
      if (!outcome.ok) {
        return toolError(outcome.error.message);
      }

      const { recommendations, evaluated, skipped, warnings } = outcome.value;
      return toolSuccess(
        JSON.stringify({
          recommendations: recommendations.map(
            ({ game, score, matchedTags }) => ({
              gameName: game.name,
              steamAppId: game.steamAppId,
              score,
              matchedTags,
              priceUSD: game.priceUSD,
              storeUrl: game.storeUrl,
            }),
          ),
          evaluated,
          skipped,
          warnings,
        }),
      );
    },
  );
}
