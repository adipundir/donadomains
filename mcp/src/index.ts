#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is OK for diagnostics; stdout is reserved for MCP protocol frames.
  console.error("donadomains-mcp ready (stdio transport)");
}

main().catch((err) => {
  console.error("donadomains-mcp fatal error:", err);
  process.exit(1);
});
