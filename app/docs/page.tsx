import { ThemeSwitcher, CodeBlock, SidebarNav, CopyDocsButton } from "./components";

function Badge({ children, color = "accent" }: { children: React.ReactNode; color?: "accent" | "green" }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-bold rounded font-comic-body"
      style={{
        background: color === "green" ? "var(--green)" : "var(--accent)",
        color: color === "green" ? "#fff" : "#000",
      }}
    >
      {children}
    </span>
  );
}

function FieldRow({ name, type, desc, optional }: { name: string; type: string; desc: string; optional?: boolean }) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2.5 px-3"
      style={{ borderBottom: "1px solid var(--border-light)" }}
    >
      <div className="flex items-center gap-2 sm:w-56 shrink-0">
        <code className="text-sm font-bold" style={{ color: "var(--green)" }}>{name}</code>
        {optional && (
          <span className="text-xs opacity-50 font-comic-body">optional</span>
        )}
      </div>
      <code className="text-xs opacity-60 sm:w-28 shrink-0">{type}</code>
      <span className="font-comic-body text-sm opacity-80">{desc}</span>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2
        className="font-comic-title text-2xl sm:text-3xl mb-4 pb-2"
        style={{ borderBottom: "2px solid var(--border-light)" }}
      >
        {title}
      </h2>
      <div className="font-comic-body space-y-4">{children}</div>
    </section>
  );
}

const NAV_ITEMS = [
  { id: "install", label: "Install" },
  { id: "tools", label: "Tools" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "issues", label: "Issues" },
];

const CLI_INSTALL = `claude mcp add --transport http donadomains https://www.donadomains.xyz/api/mcp`;

const JSON_INSTALL = `{
  "mcpServers": {
    "donadomains": {
      "type": "http",
      "url": "https://www.donadomains.xyz/api/mcp"
    }
  }
}`;

export default function DocsPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <nav className="relative z-10 py-3 sm:py-4 px-4 sm:px-6 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a
            href="/"
            className="font-comic-title text-2xl uppercase tracking-wide hover:opacity-70 transition-opacity"
          >
            Donadomains
          </a>
          <div className="flex items-center gap-3 sm:gap-4">
            <CopyDocsButton />
            <span className="font-comic-title text-xs sm:text-sm uppercase tracking-wide opacity-60">
              MCP Docs
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      <div className="px-4 sm:px-6 md:px-8 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto flex gap-6">
          <SidebarNav items={NAV_ITEMS} />

          <main className="flex-1 min-w-0 space-y-12">
            {/* Hero */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Badge>MCP</Badge>
                <Badge color="green">Free</Badge>
              </div>
              <h1 className="font-comic-title text-3xl sm:text-4xl uppercase tracking-wide mb-3">
                Donadomains <span style={{ color: "var(--accent)" }}>MCP</span>
              </h1>
              <p className="font-comic-body text-base opacity-80 max-w-2xl">
                Domain search, WHOIS, and AI valuation, available to your AI agent.
              </p>
              <p className="font-comic-body text-sm opacity-60 mt-2">
                Free. No signup. No API key.
              </p>
            </div>

            {/* Install */}
            <Section id="install" title="Install">
              <p className="opacity-80">Pick one:</p>

              <p className="font-comic-title text-sm uppercase tracking-wide mt-4 mb-2">
                Claude Code CLI
              </p>
              <CodeBlock title="terminal">{CLI_INSTALL}</CodeBlock>

              <p className="font-comic-title text-sm uppercase tracking-wide mt-6 mb-2">
                Any other MCP client
              </p>
              <p className="opacity-70 text-sm mb-2">
                Add this to your client&apos;s MCP server config (locations below):
              </p>
              <CodeBlock title="config">{JSON_INSTALL}</CodeBlock>

              <div
                className="rounded-lg overflow-hidden mt-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
              >
                <FieldRow name="Claude Desktop (macOS)" type="" desc="~/Library/Application Support/Claude/claude_desktop_config.json" />
                <FieldRow name="Claude Desktop (Windows)" type="" desc="%APPDATA%\Claude\claude_desktop_config.json" />
                <FieldRow name="Cursor" type="" desc="Settings, MCP" />
                <FieldRow name="Claude.ai web" type="" desc="Settings, Connectors, Add custom" />
              </div>
            </Section>

            {/* Tools */}
            <Section id="tools" title="Tools">
              <p className="opacity-80">Four tools your AI can call. It picks automatically based on your question.</p>

              <div className="space-y-4 mt-4">
                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">check_domain_availability</Badge>
                  </div>
                  <p className="opacity-80 text-sm">
                    Is a specific domain free? If yes, returns the lowest price and a buy
                    link. If taken, returns the registrar, expiry date, and nameservers.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">search_domains</Badge>
                  </div>
                  <p className="opacity-80 text-sm">
                    Find available domains for a keyword across GoDaddy, Namecheap, Dynadot,
                    Hover, Name.com, and Porkbun. Best for brand or project naming.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">get_domain_info</Badge>
                  </div>
                  <p className="opacity-80 text-sm">
                    Deep WHOIS, RDAP, and DNS info for a registered domain. Registrar,
                    dates, nameservers, status codes, DNSSEC.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">valuate_domain</Badge>
                  </div>
                  <p className="opacity-80 text-sm">
                    AI-powered domain valuation. Score, tier, USD range, reasoning, factors.
                  </p>
                </div>
              </div>
            </Section>

            {/* Rate Limits */}
            <Section id="rate-limits" title="Rate Limits">
              <p className="opacity-80">
                Free. Rate-limited per source IP. IPv6 addresses are counted by their /64 prefix.
              </p>

              <div
                className="rounded-lg overflow-hidden mt-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
              >
                <FieldRow name="Overall MCP calls" type="200 / hour" desc="Catch-all per IP." />
                <FieldRow name="check_domain_availability" type="60 / hour" desc="Cached, light. Shares with get_domain_info." />
                <FieldRow name="get_domain_info" type="60 / hour" desc="Cached, light." />
                <FieldRow name="search_domains" type="20 / hour" desc="Scrapes 6 registrars." />
                <FieldRow name="valuate_domain" type="20 / hour" desc="Hits Gemini on cache miss. Repeats are free." />
              </div>

              <p className="opacity-70 text-sm mt-4">
                Windows are rolling-hour from your first request. Going over returns an
                error your AI can read and explain. Repeat lookups of the same domain hit
                the cache and don&apos;t count against the per-tool quota beyond the first call.
              </p>
            </Section>

            {/* Issues */}
            <Section id="issues" title="Issues, Feedback, Higher Limits">
              <p className="opacity-80">
                Bug reports, feature requests, or want a higher limit?{" "}
                <a
                  className="underline"
                  style={{ color: "var(--accent)" }}
                  href="https://github.com/adipundir/donadomains/issues"
                >
                  Open an issue on GitHub.
                </a>
              </p>
            </Section>

            <div
              className="pt-8 mt-8 text-center font-comic-body text-sm opacity-50"
              style={{ borderTop: "1px solid var(--border-light)" }}
            >
              Donadomains MCP. Built with{" "}
              <a className="underline" href="https://modelcontextprotocol.io">
                Model Context Protocol
              </a>
              .
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
