import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSummarizePrompt } from './summarize.prompt.js';

export function registerPrompts(server: McpServer): void {
  registerSummarizePrompt(server);
}
