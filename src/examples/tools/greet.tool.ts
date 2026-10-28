import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerGreetTool(server: McpServer): void {
  server.registerTool(
    'greet',
    {
      title: 'Greet User',
      description:
        'Generates a personalized greeting message. Use this tool when you need to greet someone by name with an optional custom greeting style.',
      inputSchema: {
        name: z
          .string()
          .min(1, 'Name is required')
          .max(100, 'Name must not exceed 100 characters')
          .describe('The name of the person to greet'),
        style: z
          .enum(['formal', 'casual', 'enthusiastic'])
          .default('casual')
          .describe('The greeting style to use'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name, style }) => {
      const greetings = {
        formal: `Good day, ${name}. It is a pleasure to make your acquaintance.`,
        casual: `Hey ${name}! How's it going?`,
        enthusiastic: `WOW, ${name}! So awesome to meet you! This is going to be GREAT!`,
      } as const;

      const greeting = greetings[style];

      return {
        content: [{ type: 'text' as const, text: greeting }],
      };
    },
  );
}
