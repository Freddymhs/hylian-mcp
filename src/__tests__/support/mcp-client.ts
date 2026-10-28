import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '@tools/index.js';
import type { Services } from '@services/index.js';

export async function connectToolsClient(services: Services): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerTools(server, services);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);
  return client;
}

export interface ToolCallOutcome {
  isError: boolean;
  text: string;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolCallOutcome> {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, text: first?.text ?? '' };
}

export function parseJson<T>(outcome: ToolCallOutcome): T {
  return JSON.parse(outcome.text) as T;
}
