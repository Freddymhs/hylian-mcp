// `type` aliases (not interfaces): the MCP SDK's tool result requires an index signature.
export type TextContent = {
  type: 'text';
  text: string;
};

export type ToolResult = {
  content: TextContent[];
  isError?: boolean;
};
