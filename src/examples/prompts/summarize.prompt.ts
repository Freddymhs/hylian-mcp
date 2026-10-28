import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerSummarizePrompt(server: McpServer): void {
  server.registerPrompt(
    'summarize',
    {
      title: 'Summarize Text',
      description:
        'Creates a prompt that asks the model to summarize the given text in a specific style and length.',
      argsSchema: {
        text: z
          .string()
          .min(1, 'Text is required')
          .describe('The text content to summarize'),
        style: z
          .enum(['brief', 'detailed', 'bullet-points'])
          .default('brief')
          .describe('The summarization style'),
        maxWords: z.coerce
          .number()
          .int()
          .min(10)
          .max(1000)
          .default(100)
          .describe('Approximate maximum word count for the summary'),
      },
    },
    ({ text, style, maxWords }) => {
      const styleInstructions = {
        brief: 'Write a concise paragraph summary.',
        detailed: 'Write a comprehensive summary covering all key points.',
        'bullet-points': 'Summarize using bullet points, one per key idea.',
      } as const;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Please summarize the following text.\n\nStyle: ${styleInstructions[style]}\nMaximum length: approximately ${maxWords} words.\n\n---\n\n${text}`,
            },
          },
        ],
      };
    },
  );
}
