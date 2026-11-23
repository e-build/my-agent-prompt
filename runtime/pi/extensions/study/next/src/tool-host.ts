import type { TSchema } from "typebox";

export type ToolResult = { content: Array<{ type: "text"; text: string }>; details?: unknown };

export type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines?: string[];
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: any,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string } | undefined,
  ) => Promise<ToolResult>;
};

/** The slice of Pi's ExtensionAPI the study tools need, so tests can register without Pi. */
export type ToolHost = { registerTool: (tool: ToolDefinition) => void };

export const text = (value: string, details?: unknown): ToolResult => ({
  content: [{ type: "text", text: value }],
  ...(details === undefined ? {} : { details }),
});
