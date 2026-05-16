"use client";

import { useState } from "react";
import { CodeBlock } from "./components";

interface ClientOption {
  id: string;
  label: string;
  /** Shell command users paste in a terminal. */
  cli?: string;
  /** Config snippet users paste into their client's config file. */
  json?: string;
  /** Per-client guidance: where the config file lives, what menu to open, etc. */
  instructions: string;
}

const URL = "https://www.donadomains.xyz/api/mcp";

const JSON_DEFAULT = `{
  "mcpServers": {
    "donadomains": {
      "type": "http",
      "url": "${URL}"
    }
  }
}`;

const OPTIONS: ClientOption[] = [
  {
    id: "claude-code",
    label: "Claude Code (CLI)",
    cli: `claude mcp add --transport http donadomains ${URL}`,
    instructions: "Paste the command in your terminal.",
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    json: JSON_DEFAULT,
    instructions:
      "Paste the JSON into your config file, then restart Claude Desktop.\n\n" +
      "macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json\n" +
      "Windows: %APPDATA%\\Claude\\claude_desktop_config.json",
  },
  {
    id: "claude-web",
    label: "Claude.ai (web)",
    instructions:
      "Open Claude.ai → Settings → Connectors → Add custom connector. Paste the URL.",
    json: URL,
  },
  {
    id: "cursor",
    label: "Cursor",
    json: JSON_DEFAULT,
    instructions: "Open Cursor → Settings → MCP → Add new server. Paste the JSON.",
  },
  {
    id: "continue",
    label: "Continue",
    json: JSON_DEFAULT,
    instructions: "Add the JSON to ~/.continue/config.json under mcpServers.",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    json: JSON_DEFAULT,
    instructions: "Open Windsurf → Settings → Cascade → MCP servers → Add HTTP server. Paste the JSON.",
  },
  {
    id: "zed",
    label: "Zed",
    json: `{
  "context_servers": {
    "donadomains": {
      "url": "${URL}"
    }
  }
}`,
    instructions: "Add to ~/.config/zed/settings.json under context_servers.",
  },
  {
    id: "codex",
    label: "Codex CLI",
    json: `[mcp_servers.donadomains]
type = "http"
url = "${URL}"`,
    instructions: "Add to ~/.codex/config.toml (Codex uses TOML, not JSON).",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    json: JSON_DEFAULT,
    instructions: "Open Antigravity → Settings → MCP → Add HTTP server. Paste the JSON.",
  },
  {
    id: "other",
    label: "Other MCP client",
    json: JSON_DEFAULT,
    instructions:
      "Works in any client that supports the Streamable HTTP transport. Look for an MCP / context-server section in your client's settings.",
  },
];

export function InstallPicker() {
  const [selectedId, setSelectedId] = useState<string>(OPTIONS[0].id);
  const option = OPTIONS.find((o) => o.id === selectedId) ?? OPTIONS[0];

  return (
    <div className="space-y-3">
      {/* Right-aligned ghost dropdown — no border, opacity until hovered */}
      <div className="flex justify-end -mt-1">
        <select
          aria-label="MCP client"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="font-comic-body text-sm font-medium bg-transparent text-[var(--foreground)] opacity-60 hover:opacity-100 focus:opacity-100 cursor-pointer focus:outline-none transition-opacity pr-1"
        >
          {OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <p className="font-comic-body text-sm opacity-80 whitespace-pre-line">
        {option.instructions}
      </p>

      {option.cli && <CodeBlock title="terminal">{option.cli}</CodeBlock>}

      {option.json && (
        <CodeBlock title={option.id === "claude-web" ? "URL" : "config"}>
          {option.json}
        </CodeBlock>
      )}
    </div>
  );
}
