import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import { LIBRARY_FILTERS } from '@db/index.js';
import {
  DEFAULT_LIST_LIMIT,
  LIBRARY_SORT_KEYS,
  MAX_LIST_LIMIT,
  minutesToHours,
  sortLibrary,
} from '@services/index.js';
import type { Services } from '@services/container.js';

export function registerListMyGamesTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'list_my_games',
    {
      title: 'List My Games',
      description:
        "Lists the games in the user's library with playtime and last played date. Filter by played/unplayed and sort by name, playtime or last played. Returns { total, returned, games: [{ gameId, name, steamAppId, playtimeHours, lastPlayed }] } — total is the count after filtering, games is capped by limit; gameId is what delete_game needs.",
      inputSchema: {
        filter: z
          .enum(LIBRARY_FILTERS)
          .default('all')
          .describe('"played" = playtime > 0, "unplayed" = never played'),
        sortBy: z
          .enum(LIBRARY_SORT_KEYS)
          .default('name')
          .describe('"playtime" and "lastPlayed" sort descending'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_LIMIT)
          .default(DEFAULT_LIST_LIMIT)
          .describe('Maximum games to return'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ filter, sortBy, limit }) => {
      const library = services.library();
      if (!library.ok) {
        return toolError(library.error.message);
      }

      const items = await library.value.list(filter);
      if (!items.ok) {
        return toolError(`Could not read the library: ${items.error.message}`);
      }

      const sorted = sortLibrary(items.value, sortBy);
      const games = sorted.slice(0, limit).map((item) => ({
        gameId: item.gameId,
        name: item.name,
        steamAppId: item.steamAppId,
        playtimeHours: minutesToHours(item.playtimeMinutes),
        lastPlayed: item.lastPlayed,
      }));
      return toolSuccess(
        JSON.stringify({
          total: sorted.length,
          returned: games.length,
          games,
        }),
      );
    },
  );
}
