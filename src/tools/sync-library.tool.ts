import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolError, toolSuccess } from '@common/errors.js';
import { syncLibrary } from '@services/library-sync.js';
import type { Services } from '@services/container.js';

export function registerSyncLibraryTool(
  server: McpServer,
  services: Services,
): void {
  server.registerTool(
    'sync_library',
    {
      title: 'Sync Steam Library',
      description:
        'Syncs the owned games of the configured Steam account into the library database (upsert, safe to re-run). Returns { synced, newGames, totalPlaytime } where totalPlaytime is in hours. Use it before reviewing a game bought recently.',
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const steam = services.steam();
      if (!steam.ok) {
        return toolError(steam.error.message);
      }
      const games = services.games();
      if (!games.ok) {
        return toolError(games.error.message);
      }
      const library = services.library();
      if (!library.ok) {
        return toolError(library.error.message);
      }

      const summary = await syncLibrary({
        steam: steam.value,
        games: games.value,
        library: library.value,
      });
      return summary.ok
        ? toolSuccess(JSON.stringify(summary.value))
        : toolError(summary.error.message);
    },
  );
}
