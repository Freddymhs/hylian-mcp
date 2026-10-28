import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerSummarizePrompt } from '../summarize.prompt.js';

async function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.1' });
  registerSummarizePrompt(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);

  return { client };
}

describe('summarize prompt', () => {
  it('lists the summarize prompt', async () => {
    const { client } = await setup();
    const { prompts } = await client.listPrompts();
    const summarize = prompts.find((p) => p.name === 'summarize');

    expect(summarize).toBeDefined();
    expect(summarize!.description).toContain('summarize');
  });

  it('generates a brief summary prompt', async () => {
    const { client } = await setup();
    const result = await client.getPrompt({
      name: 'summarize',
      arguments: {
        text: 'The quick brown fox jumps over the lazy dog.',
        style: 'brief',
        maxWords: '50',
      },
    });

    const message = result.messages[0];
    expect(message).toBeDefined();
    expect(message!.role).toBe('user');

    const content = message!.content as { type: string; text: string };
    expect(content.text).toContain('quick brown fox');
    expect(content.text).toContain('concise paragraph');
    expect(content.text).toContain('50 words');
  });

  it('generates a bullet-points prompt', async () => {
    const { client } = await setup();
    const result = await client.getPrompt({
      name: 'summarize',
      arguments: {
        text: 'Some long text to summarize.',
        style: 'bullet-points',
        maxWords: '200',
      },
    });

    const content = result.messages[0]!.content as {
      type: string;
      text: string;
    };
    expect(content.text).toContain('bullet points');
    expect(content.text).toContain('200 words');
  });

  it('uses defaults when optional params omitted', async () => {
    const { client } = await setup();
    const result = await client.getPrompt({
      name: 'summarize',
      arguments: {
        text: 'Default test text.',
      },
    });

    const content = result.messages[0]!.content as {
      type: string;
      text: string;
    };
    expect(content.text).toContain('concise paragraph');
    expect(content.text).toContain('100 words');
  });
});
