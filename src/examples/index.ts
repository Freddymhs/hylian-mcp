import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGreetTool } from './tools/greet.tool.js';
import { registerSummarizePrompt } from './prompts/summarize.prompt.js';
import { registerServerInfoResource } from './resources/server-info.resource.js';

export function registerExamples(server: McpServer): void {
  registerGreetTool(server);
  registerSummarizePrompt(server);
  registerServerInfoResource(server);
}
