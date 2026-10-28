import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import { GAME_SEARCH_SOURCES } from '@db/index.js';
import { readManualMetadata } from '@providers/index.js';
import type { Services } from '@services/container.js';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_QUERY_LENGTH,
} from './constants.js';

export function registerSearchGamesTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'search_games',
    {
      title: 'Search Games',
      description:
        'Searches the catalog (Steam-synced and manual games) by name, tag or genre, case-insensitive and partial. Looks only at what is already in the database — it never calls Steam. Returns { returned, games: [{ gameId, name, source, steamAppId, tags }] }; gameId is what delete_game needs.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1, 'Query is required')
          .max(MAX_SEARCH_QUERY_LENGTH)
          .describe('Part of a name, tag or genre'),
        source: z
          .enum(GAME_SEARCH_SOURCES)
          .default('all')
          .describe('Restrict to Steam-synced or manual games'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .default(DEFAULT_SEARCH_LIMIT)
          .describe('Maximum games to return'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, source, limit }) => {
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }

      const hits = await games.value.search({ query, source, limit });
      if (!hits.ok) {
        return toolError(`Could not search the catalog: ${hits.error.message}`);
      }

      const found = hits.value.map(
        ({ id, name, source: hitSource, steamAppId, metadata }) => {
          const { tags, genres } = readManualMetadata(metadata);
          return {
            gameId: id,
            name,
            source: hitSource,
            steamAppId,
            tags: [...new Set([...tags, ...genres])],
          };
        },
      );
      return toolSuccess(
        JSON.stringify({ returned: found.length, games: found }),
      );
    },
  );
}
