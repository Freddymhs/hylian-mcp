import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '@services/container.js';
import { registerSyncLibraryTool } from './sync-library.tool.js';
import { registerReviewGameTool } from './review-game.tool.js';
import { registerListMyGamesTool } from './list-my-games.tool.js';
import { registerEditReviewTool } from './edit-review.tool.js';
import { registerDeleteReviewTool } from './delete-review.tool.js';
import { registerDeleteGameTool } from './delete-game.tool.js';
import { registerRecommendPurchaseTool } from './recommend-purchase.tool.js';
import { registerAddManualGameTool } from './add-manual-game.tool.js';
import { registerSearchGamesTool } from './search-games.tool.js';

export function registerTools(server: McpServer, services: Services): void {
  registerSyncLibraryTool(server, services);
  registerReviewGameTool(server, services);
  registerListMyGamesTool(server, services);
  registerEditReviewTool(server, services);
  registerDeleteReviewTool(server, services);
  registerDeleteGameTool(server, services);
  registerRecommendPurchaseTool(server, services);
  registerAddManualGameTool(server, services);
  registerSearchGamesTool(server, services);
}
