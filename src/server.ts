import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { env } from '@config/env.js';
import { SERVER_NAME, SERVER_VERSION } from '@config/constants.js';
import { registerTools } from '@tools/index.js';
import { registerResources } from '@resources/index.js';
import { registerPrompts } from '@prompts/index.js';
import { registerExamples } from '@examples/index.js';
import { createServices } from '@services/index.js';
import type { Services } from '@services/index.js';

export function createServer(services: Services = createServices()): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, services);
  registerResources(server);
  registerPrompts(server);

  const isProduction = env.nodeEnv === 'production';
  if (!isProduction) {
    registerExamples(server);
  }

  return server;
}
