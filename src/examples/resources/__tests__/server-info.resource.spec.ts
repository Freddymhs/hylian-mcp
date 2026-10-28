import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SERVER_NAME, SERVER_VERSION } from '@config/constants.js';
import { registerServerInfoResource } from '../server-info.resource.js';

async function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerServerInfoResource(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);

  return { client };
}

describe('server-info resource', () => {
  it('lists the server-info resource', async () => {
    const { client } = await setup();
    const { resources } = await client.listResources();
    const info = resources.find((r) => r.uri === 'info://server');

    expect(info).toBeDefined();
    expect(info!.name).toBe('server-info');
  });

  it('returns valid server info JSON', async () => {
    const { client } = await setup();
    const result = await client.readResource({ uri: 'info://server' });
    const content = result.contents[0];

    expect(content).toBeDefined();
    expect(content!.mimeType).toBe('application/json');

    const textContent = content as {
      uri: string;
      text: string;
      mimeType?: string;
    };
    const data = JSON.parse(textContent.text);
    expect(data.name).toBe(SERVER_NAME);
    expect(data.version).toBe(SERVER_VERSION);
    expect(data.nodeVersion).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(typeof data.uptime).toBe('number');
  });
});
