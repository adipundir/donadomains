/**
 * MCP server over Streamable HTTP transport.
 *
 * Lets any MCP-aware client connect by URL instead of stdio:
 *   { "mcpServers": { "donadomains": { "url": "https://donadomains.xyz/api/mcp" } } }
 *
 * Implements the subset of the MCP spec we need:
 *   - initialize / initialized
 *   - tools/list
 *   - tools/call
 *   - ping
 *
 * Two-layer rate limiting:
 *   1. Per-IP overall MCP cap (200 frames/hr) — checked on every POST
 *   2. Per-tool cap matching the REST endpoint limits — checked before the
 *      tool handler runs
 *
 * Stateless. No session ID required. CORS open so browser-based MCP
 * clients (e.g. Claude.ai web Connectors) can call directly.
 */

import { type NextRequest, NextResponse } from "next/server";
import { checkApiRateLimit, getClientIp } from "@/app/lib/api-rate-limit";
import { ALL_DEFINITIONS, TOOLS_BY_NAME } from "@/app/lib/mcp-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER_NAME = "donadomains-mcp";
const SERVER_VERSION = "0.2.0";
const PROTOCOL_VERSION = "2024-11-05";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

// ─── JSON-RPC types ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// JSON-RPC error codes:
//   -32700 Parse error  -32600 Invalid Request  -32601 Method not found
//   -32602 Invalid params  -32603 Internal error  -32029 (custom) Rate limit
const ERROR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  RATE_LIMIT: -32029,
} as const;

function ok(id: string | number | null, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS_HEADERS });
}

function err(id: string | number | null, error: JsonRpcError, status = 200): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, error }, { status, headers: CORS_HEADERS });
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET — returns a small self-description so users probing the URL in a
 * browser see something useful. MCP clients send POST; GET is for humans.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: PROTOCOL_VERSION,
      transport: "streamable-http",
      tools: ALL_DEFINITIONS.map((d) => ({ name: d.name, description: d.description.slice(0, 80) + "…" })),
      docs: "https://donadomains.xyz/docs#mcp",
      sourceCode: "https://github.com/adipundir/donadomains/tree/main/mcp",
    },
    { headers: CORS_HEADERS },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);

  // Layer 1: overall MCP rate limit (per IP)
  const overall = await checkApiRateLimit(ip, "mcp");
  if (overall) {
    return err(null, { code: ERROR.RATE_LIMIT, message: overall }, 429);
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return err(null, { code: ERROR.PARSE, message: "Invalid JSON in request body" }, 400);
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return err(body.id ?? null, { code: ERROR.INVALID_REQUEST, message: "Invalid JSON-RPC request" }, 400);
  }

  // Notifications (no `id`) get no response per JSON-RPC spec. MCP only sends
  // `notifications/initialized` and `notifications/cancelled` — both informational.
  if (body.id === undefined && body.method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const id = body.id ?? null;

  switch (body.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: ALL_DEFINITIONS.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: d.inputSchema,
        })),
      });

    case "tools/call": {
      const params = body.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments as Record<string, unknown> | undefined) ?? {};

      const tool = TOOLS_BY_NAME.get(name);
      if (!tool) {
        return err(id, { code: ERROR.INVALID_PARAMS, message: `Unknown tool: ${name}` });
      }

      // Layer 2: per-tool rate limit (mirrors REST endpoint budgets)
      const toolLimit = await checkApiRateLimit(ip, tool.definition.rateLimitKey);
      if (toolLimit) {
        // For tool calls, surface rate-limit hits as a tool error rather
        // than a JSON-RPC error so the LLM can read and explain them.
        return ok(id, {
          isError: true,
          content: [
            {
              type: "text",
              text: `Rate limit: ${toolLimit} (tool: ${name})`,
            },
          ],
        });
      }

      try {
        const result = await tool.handler(args, { ip });
        return ok(id, result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[/api/mcp] tool=${name} threw:`, message);
        return ok(id, {
          isError: true,
          content: [{ type: "text", text: `Tool ${name} threw: ${message}` }],
        });
      }
    }

    default:
      return err(id, { code: ERROR.METHOD_NOT_FOUND, message: `Method not found: ${body.method}` });
  }
}
