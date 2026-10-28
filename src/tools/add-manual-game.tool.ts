import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import {
  MAX_RELEASE_YEAR,
  MIN_RELEASE_YEAR,
  manualMetadataSchema,
} from '@providers/index.js';
import { normalizeTag } from '@services/tags.js';
import type { Services } from '@services/container.js';
import { MAX_GAME_NAME_LENGTH, MAX_GAME_TAGS } from './constants.js';

const labels = z.array(z.string().trim().min(1)).max(MAX_GAME_TAGS);

export function registerAddManualGameTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'add_manual_game',
    {
      title: 'Add Manual Game',
      description:
        'Adds a game that is not on Steam (console, physical copy, other store) to the catalog so it can be reviewed with review_game and found with search_games. It goes to the catalog only: it will NOT show in list_my_games and is never recommended. Fails if a game with the same name already exists. Returns { gameId, name, source, externalId }.',
      inputSchema: {
        name: z
          .string()
          .trim()
          .min(1, 'Name is required')
          .max(MAX_GAME_NAME_LENGTH)
          .describe(
            'Game name; include the platform to tell versions apart, e.g. "Tunic (Switch)"',
          ),
        metadata: z
          .object({
            genres: labels.optional().describe('Genres, e.g. ["metroidvania"]'),
            tags: labels
              .optional()
              .describe('Free-form tags, matched against review tags'),
            releaseYear: z
              .number()
              .int()
              .min(MIN_RELEASE_YEAR)
              .max(MAX_RELEASE_YEAR)
              .optional(),
            developer: z.string().trim().min(1).optional(),
            priceUSD: z.number().nonnegative().optional(),
            description: z.string().optional(),
            storeUrl: z.string().url().optional(),
          })
          .optional()
          .describe('Optional details about the game'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, metadata }) => {
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }

      // review_game resolves games by name: two rows with the same name would make it ambiguous.
      const sameName = await games.value.findByName(name);
      if (!sameName.ok) {
        return toolError(
          `Could not check the catalog: ${sameName.error.message}`,
        );
      }
      const duplicate = sameName.value.find(
        (game) => normalizeTag(game.name) === normalizeTag(name),
      );
      if (duplicate) {
        return toolError(
          `A game named "${duplicate.name}" already exists in the catalog. Use a different name (e.g. add the platform)`,
        );
      }

      const externalId = crypto.randomUUID();
      const added = await games.value.insertManual({
        externalId,
        name,
        metadata: manualMetadataSchema.parse(metadata ?? {}),
      });
      if (!added.ok) {
        return toolError(`Could not add the game: ${added.error.message}`);
      }

      return toolSuccess(
        JSON.stringify({
          gameId: added.value.id,
          name,
          source: 'manual',
          externalId,
        }),
      );
    },
  );
}
