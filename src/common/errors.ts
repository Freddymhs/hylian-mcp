import type { ToolResult } from './types.js';

export function toolSuccess(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function toolError(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
