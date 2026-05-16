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
    instructions: "Paste the command in your terminal. The server is registered in your project's local Claude Code config.",
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
      "Open Claude.ai → Settings → Connectors → Add custom connector. Paste the URL below.",
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
      "Works in any client that supports the Streamable HTTP transport. Look for an 'MCP server' or 'context server' section in your client's settings and paste the JSON.",
  },
];

export function InstallPicker() {
  const [selectedId, setSelectedId] = useState<string>(OPTIONS[0].id);
  const option = OPTIONS.find((o) => o.id === selectedId) ?? OPTIONS[0];

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="install-picker"
          className="font-comic-body text-xs font-bold uppercase tracking-widest opacity-50 block mb-2"
        >
          What are you using?
        </label>
        <select
          id="install-picker"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="font-comic-body w-full sm:max-w-xs px-4 py-3 text-base font-medium border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] focus:outline-none focus:shadow-[3px_3px_0px_var(--accent)] transition-shadow cursor-pointer"
          style={{ borderRadius: 0 }}
        >
          {OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="font-comic-body text-sm opacity-80 whitespace-pre-line">
          {option.instructions}
        </p>

        {option.cli && (
          <CodeBlock title="terminal">{option.cli}</CodeBlock>
        )}

        {option.json && (
          <CodeBlock title={option.id === "claude-web" ? "URL" : "config"}>
            {option.json}
          </CodeBlock>
        )}
      </div>
    </div>
  );
}
