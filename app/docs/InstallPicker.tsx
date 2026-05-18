"use client";

import { useEffect, useRef, useState } from "react";
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
      "Easiest: ask Claude in the desktop app — \"add this MCP server: " +
      URL +
      "\". Claude will edit your config for you.\n\nOr paste the JSON manually into your config file, then restart Claude Desktop:\n\nmacOS:   ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json",
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
      "Works in any MCP client. Look for an MCP / context-server section in your client's settings and paste the JSON.",
  },
];

// ─── Custom dropdown ────────────────────────────────────────────────────────

function ClientDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-comic-body inline-flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="opacity-90">{selected.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] py-1 rounded-lg shadow-lg animate-fadeIn"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-light)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          {OPTIONS.map((o) => {
            const isSelected = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`font-comic-body w-full text-left text-sm px-3 py-1.5 flex items-center justify-between transition-colors ${
                  isSelected
                    ? "bg-[var(--accent-subtle)] text-[var(--foreground)]"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                <span>{o.label}</span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main picker ─────────────────────────────────────────────────────────────

export function InstallPicker() {
  const [selectedId, setSelectedId] = useState<string>(OPTIONS[0].id);
  const option = OPTIONS.find((o) => o.id === selectedId) ?? OPTIONS[0];

  return (
    <div className="space-y-3">
      <div className="flex justify-end -mt-1">
        <ClientDropdown value={selectedId} onChange={setSelectedId} />
      </div>

      <p className="font-comic-body text-sm opacity-60 whitespace-pre-line">
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
