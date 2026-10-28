import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

async function connectClient(nodeEnv: string): Promise<Client> {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { createServer } = await import('../server.js');

  const server = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);
  return client;
}

// A server with nothing registered for a primitive does not advertise it,
// so listing it answers MethodNotFound instead of an empty list.
async function namesOrEmpty(list: () => Promise<string[]>): Promise<string[]> {
  try {
    return await list();
  } catch (error) {
    if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
      return [];
    }
    throw error;
  }
}

async function listNames(client: Client) {
  const tools = await namesOrEmpty(async () =>
    (await client.listTools()).tools.map((t) => t.name),
  );
  const prompts = await namesOrEmpty(async () =>
    (await client.listPrompts()).prompts.map((p) => p.name),
  );
  const resources = await namesOrEmpty(async () =>
    (await client.listResources()).resources.map((r) => r.name),
  );
  return { tools, prompts, resources };
}

describe('createServer examples gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes example placeholders outside production', async () => {
    const client = await connectClient('development');

    const { tools, prompts, resources } = await listNames(client);

    expect(tools).toContain('greet');
    expect(prompts).toContain('summarize');
    expect(resources).toContain('server-info');
  });

  it('hides example placeholders in production', async () => {
    const client = await connectClient('production');

    const { tools, prompts, resources } = await listNames(client);

    expect(tools).not.toContain('greet');
    expect(prompts).not.toContain('summarize');
    expect(resources).not.toContain('server-info');
  });
});
