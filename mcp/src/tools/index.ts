import type { AnyTool } from "./types.js";
import { checkAvailability } from "./check-availability.js";
import { searchDomains } from "./search-domains.js";
import { getDomainInfo } from "./get-domain-info.js";
import { valuateDomain } from "./valuate-domain.js";

export type { Tool, AnyTool, ToolDefinition, ToolResult, TextContent, JsonSchema } from "./types.js";

// Order here is the order tools are advertised to clients. Keep the most
// commonly used tools first — many UIs render this list as-is. Each tool is
// erased to AnyTool at the registry boundary; runtime arg validation is the
// MCP client's job (it validates against `definition.inputSchema`).
export const tools: AnyTool[] = [
  checkAvailability as unknown as AnyTool,
  searchDomains as unknown as AnyTool,
  getDomainInfo as unknown as AnyTool,
  valuateDomain as unknown as AnyTool,
];

export const toolsByName: Map<string, AnyTool> = new Map(
  tools.map((t) => [t.definition.name, t]),
);
