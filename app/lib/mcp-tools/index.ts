/**
 * Tool registry: definition + handler keyed by tool name.
 * Order matters — clients that render the list directly will see this order.
 */

import {
  ALL_DEFINITIONS,
  CHECK_AVAILABILITY,
  GET_DOMAIN_INFO,
  SEARCH_DOMAINS,
  VALUATE_DOMAIN,
  type ToolDefinition,
} from "./definitions";
import {
  checkAvailability,
  getDomainInfo,
  searchDomains,
  valuateDomain,
} from "./handlers";
import type { ToolHandler } from "./types";

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export const TOOLS: RegisteredTool[] = [
  { definition: CHECK_AVAILABILITY, handler: checkAvailability },
  { definition: SEARCH_DOMAINS, handler: searchDomains },
  { definition: GET_DOMAIN_INFO, handler: getDomainInfo },
  { definition: VALUATE_DOMAIN, handler: valuateDomain },
];

export const TOOLS_BY_NAME: Map<string, RegisteredTool> = new Map(
  TOOLS.map((t) => [t.definition.name, t]),
);

export { ALL_DEFINITIONS };
export type { ToolDefinition };
export type { ToolHandler, ToolResult, TextContent, ToolContext, JsonSchema } from "./types";
