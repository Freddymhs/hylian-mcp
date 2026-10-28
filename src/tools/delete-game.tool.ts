import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '@common/errors.js';
import type { Services } from '@services/container.js';
import { refreshProfile } from './refresh-profile.js';

export function registerDeleteGameTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'delete_game',
    {
      title: 'Delete Game',
      description:
        'Permanently removes a game from the catalog together with its library entry and ALL its reviews (cascade, not recoverable). ALWAYS ask the user to confirm before calling. A Steam game the user still owns comes back on the next sync_library, but without its reviews. Returns { deleted, gameId, gameName }.',
      inputSchema: {
        gameId: z
          .string()
          .uuid()
          .describe('Game id (games.id), not the Steam appid'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ gameId }) => {
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }

      const deleted = await games.value.deleteById(gameId);
      if (!deleted.ok) {
        return toolError(`Could not delete the game: ${deleted.error.message}`);
      }
      if (deleted.value === null) {
        return toolError(`Game ${gameId} not found`);
      }

      await refreshProfile(services);
      return toolSuccess(
        JSON.stringify({ deleted: true, gameId, gameName: deleted.value.name }),
      );
    },
  );
}
