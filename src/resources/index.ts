import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerServerInfoResource } from './server-info.resource.js';

export function registerResources(server: McpServer): void {
  registerServerInfoResource(server);
}
