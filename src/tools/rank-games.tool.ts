import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import { rankGames } from '@services/index.js';
import type { Services } from '@services/container.js';
import {
  MAX_GAME_NAME_LENGTH,
  MAX_GAME_TAGS,
  MAX_RANK_GAMES,
} from './constants.js';

export function registerRankGamesTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'rank_games',
    {
      title: 'Rank Games',
      description:
        'Ranks a list of games the user brings (any source: VR ports, emulators, a store page, a friend\'s list) against their taste profile, which is derived from their tagged reviews. Nothing is stored and no store is searched. Give each game the genre/mechanic/theme tags you know or infer for it, in the same vocabulary as review tags (e.g. "fps", "horror", "racing"). score is 0-100 relative to the best game of this list. Needs reviews with extractedTags. Returns { ranked: [{ name, score, matchedTags }], unmatched: [name] } — unmatched share no tag with the profile, which means unknown, not disliked.',
      inputSchema: {
        games: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(MAX_GAME_NAME_LENGTH),
              tags: z
                .array(z.string().trim().min(1))
                .min(1)
                .max(MAX_GAME_TAGS)
                .describe('Genre/mechanic/theme tags of this game'),
            }),
          )
          .min(1)
          .max(MAX_RANK_GAMES)
          .describe('Games to rank, each with its tags'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ games }) => {
      const profile = services.profile();
      if (!profile.ok) {
        return toolError(profile.error.message);
      }

      const outcome = await rankGames(profile.value, games);
      if (!outcome.ok) {
        return toolError(outcome.error.message);
      }
      return toolSuccess(JSON.stringify(outcome.value));
    },
  );
}
