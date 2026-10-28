import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerGreetTool } from '../greet.tool.js';

async function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerGreetTool(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);

  return { client };
}

describe('greet tool', () => {
  it('lists the greet tool', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const greet = tools.find((t) => t.name === 'greet');

    expect(greet).toBeDefined();
    expect(greet!.description).toContain('greeting');
  });

  it('returns casual greeting by default', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'greet',
      arguments: { name: 'Freddy' },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]
      ?.text;
    expect(text).toContain('Freddy');
    expect(text).toContain("How's it going");
  });

  it('returns formal greeting when requested', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'greet',
      arguments: { name: 'Dr. Smith', style: 'formal' },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]
      ?.text;
    expect(text).toContain('Dr. Smith');
    expect(text).toContain('pleasure');
  });

  it('returns enthusiastic greeting when requested', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'greet',
      arguments: { name: 'Alice', style: 'enthusiastic' },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]
      ?.text;
    expect(text).toContain('Alice');
    expect(text).toContain('GREAT');
  });

  it('rejects empty name', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'greet',
      arguments: { name: '' },
    });

    expect(result.isError).toBe(true);
  });
});
