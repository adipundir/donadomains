/**
 * Minimal MCP tool types — the published SDK has these too, but we mirror
 * them locally so the route handler doesn't pull the SDK into the bundle.
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

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

export interface ToolContext {
  /** Normalized client IP (IPv6 already collapsed to /64). */
  ip: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;
