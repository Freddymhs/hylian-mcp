import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGreetTool } from './greet.tool.js';

export function registerTools(server: McpServer): void {
  registerGreetTool(server);
}
