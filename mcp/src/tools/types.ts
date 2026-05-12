/**
 * Shared shapes for tool definitions + handlers.
 *
 * We use plain JSON Schema (not Zod) to keep the published bundle small.
 * The MCP SDK accepts JSON Schema directly in tool definitions.
 */

export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

export interface Tool<Args = Record<string, unknown>> {
  definition: ToolDefinition;
  handler: (args: Args) => Promise<ToolResult>;
}

/**
 * Type-erased tool used by the server registry. Each tool is registered with
 * its specific Args type, but the dispatcher only deals with `unknown` args
 * since it doesn't know which tool was called until runtime.
 */
export type AnyTool = Tool<Record<string, unknown>>;
