import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_NAME, SERVER_VERSION } from '@config/constants.js';

export function registerServerInfoResource(server: McpServer): void {
  server.registerResource(
    'server-info',
    'info://server',
    {
      title: 'Server Information',
      description: 'Returns metadata about this MCP server',
      mimeType: 'application/json',
    },
    async (uri) => {
      const info = {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        uptime: process.uptime(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  );
}
