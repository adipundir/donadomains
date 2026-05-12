import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, toolsByName } from "./tools/index.js";

const SERVER_NAME = "donadomains-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.definition),
  }));

  // The SDK's CallToolResult type recently grew an optional `task` field for
  // agent-style tools. Our handlers return plain {content, isError?} which is
  // a valid subset, but the strict type complains — cast at the boundary.
  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args } = req.params;
    const tool = toolsByName.get(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      } as CallToolResult;
    }
    try {
      const result = await tool.handler((args ?? {}) as Record<string, unknown>);
      return result as unknown as CallToolResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Tool ${name} threw: ${message}` }],
      } as CallToolResult;
    }
  });

  return server;
}
