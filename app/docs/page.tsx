import { ThemeSwitcher, CodeBlock, TabbedCode, SidebarNav, CopyDocsButton } from "./components";

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
      <div className="flex items-center gap-2 sm:w-48 shrink-0">
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
  { id: "overview", label: "Overview" },
  { id: "install", label: "Install" },
  { id: "tools", label: "Tools" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "examples", label: "Examples" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const CONFIG_URL = `{
  "mcpServers": {
    "donadomains": {
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
      {/* Navbar */}
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

          {/* Sidebar */}
          <SidebarNav items={NAV_ITEMS} />

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-12">
            {/* Hero */}
            <div id="overview" className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-3">
                <Badge>MCP</Badge>
                <Badge color="green">Free</Badge>
              </div>
              <h1 className="font-comic-title text-3xl sm:text-4xl uppercase tracking-wide mb-3">
                Donadomains <span style={{ color: "var(--accent)" }}>MCP</span>
              </h1>
              <p className="font-comic-body text-base opacity-80 max-w-2xl mb-3">
                Give your AI agent real-time domain superpowers. Check availability, compare prices
                across 6 registrars, look up WHOIS/RDAP intel for any TLD (including <code>.sh</code>,
                <code> .io</code>, <code>.ac</code>), and estimate domain value — from any MCP
                client that supports the Streamable HTTP transport.
              </p>
              <p className="font-comic-body text-sm opacity-60">
                Free. No signup. No API key. Connect by URL.
              </p>
            </div>

            {/* What it does */}
            <div
              className="rounded-lg p-5 space-y-3"
              style={{ background: "var(--surface)", border: "2px solid var(--border-light)" }}
            >
              <p className="font-comic-title text-lg uppercase tracking-wide">Try asking your AI</p>
              <ul className="list-disc list-inside space-y-1.5 opacity-80 font-comic-body">
                <li>&quot;Is <code>donataxes.com</code> available? What about <code>.io</code>?&quot;</li>
                <li>&quot;Find me a cheap, brandable domain for a craft-beer brand under $20/yr.&quot;</li>
                <li>&quot;Who owns <code>github.com</code> and when does it expire?&quot;</li>
                <li>&quot;What&apos;s <code>crypto.com</code> roughly worth?&quot;</li>
                <li>&quot;Is <code>ad402.sh</code> taken? When does it expire?&quot;</li>
              </ul>
            </div>

            {/* Install */}
            <Section id="install" title="Install">
              <p className="opacity-80">
                Add this block to your MCP client&apos;s server config. No signup, no API key, free.
              </p>

              <div className="mt-4">
                <CodeBlock title="config">{CONFIG_URL}</CodeBlock>
              </div>

              <p className="opacity-70 text-sm mt-4">
                The endpoint speaks the <strong>Streamable HTTP</strong> transport — supported by
                any current MCP client (Claude Desktop, Claude.ai Connectors, Cursor, Continue,
                Windsurf, Zed). If your client only supports stdio and won&apos;t accept a URL, it
                cannot connect today.
              </p>

              <p className="opacity-60 text-sm mt-4">
                Where the config file lives depends on your client. Common locations:
                <br />
                <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS,
                Claude Desktop),{" "}
                <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).
                Cursor: Settings → MCP. Claude.ai web: Settings → Connectors → Add custom.
              </p>
            </Section>

            {/* Tools */}
            <Section id="tools" title="Tools">
              <p className="opacity-80 mb-3">
                Four tools your AI can call. Tool descriptions are tuned so the AI picks the
                right one automatically — you don&apos;t need to name them in prompts.
              </p>

              <div className="space-y-4">
                {/* check_domain_availability */}
                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">check_domain_availability</Badge>
                  </div>
                  <p className="opacity-80 text-sm mb-2">
                    Check if a specific domain is available right now. Returns availability +
                    lowest price + buy URL if free, or registrar + dates + nameservers if taken.
                    Handles RDAP-less ccTLDs (<code>.sh</code>, <code>.io</code>, <code>.ac</code>,
                    <code> .ws</code>) via port-43 WHOIS.
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                  >
                    <FieldRow name="domain" type="string" desc="Fully qualified domain, e.g. 'example.com' or 'ad402.sh'." />
                  </div>
                </div>

                {/* search_domains */}
                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">search_domains</Badge>
                  </div>
                  <p className="opacity-80 text-sm mb-2">
                    Search for available domains across GoDaddy, Namecheap, Dynadot, Hover,
                    Name.com, and Porkbun. Returns prices, the cheapest registrar, and direct
                    buy URLs. Best for brand/startup/product naming.
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                  >
                    <FieldRow name="keyword" type="string" desc="Bare word ('startup') or full domain ('startup.io')." />
                    <FieldRow name="limit" type="number" desc="Max results (default 20, max 50)." optional />
                    <FieldRow name="tldFilter" type="string" desc="Only return this TLD, e.g. '.com'. Include the leading dot." optional />
                    <FieldRow name="includeTaken" type="boolean" desc="Include taken domains in the results (default false)." optional />
                  </div>
                </div>

                {/* get_domain_info */}
                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">get_domain_info</Badge>
                  </div>
                  <p className="opacity-80 text-sm mb-2">
                    Deep WHOIS / RDAP / DNS intel for a registered domain — registrar,
                    creation and expiry dates, nameservers, registrant (if not privacy-protected),
                    DNSSEC status, and ICANN status codes.
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                  >
                    <FieldRow name="domain" type="string" desc="Fully qualified domain, e.g. 'github.com'." />
                  </div>
                </div>

                {/* valuate_domain */}
                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="green">valuate_domain</Badge>
                  </div>
                  <p className="opacity-80 text-sm mb-2">
                    AI-powered domain valuation. Returns score (0-100), tier
                    (common/decent/premium/ultra), estimated USD range, reasoning, and per-factor
                    breakdown (TLD value, length, brandability, keyword strength, age).
                    Results are cached server-side, so repeat valuations are instant and free.
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                  >
                    <FieldRow name="domain" type="string" desc="Domain to value, e.g. 'crypto.com'." />
                    <FieldRow name="registered" type="boolean" desc="Skip the registration lookup if you already know." optional />
                    <FieldRow name="isPremium" type="boolean" desc="Flag a registrar-premium domain (anchors valuation up)." optional />
                    <FieldRow name="registrationPrice" type="number" desc="Current registration price in USD." optional />
                  </div>
                </div>
              </div>
            </Section>

            {/* Rate Limits */}
            <Section id="rate-limits" title="Rate Limits">
              <p className="opacity-80">
                Donadomains MCP is <strong>free</strong> and unauthenticated. To keep it usable for
                everyone, calls are rate-limited per source IP. IPv6 addresses are normalized to
                their <code>/64</code> prefix before being counted.
              </p>

              <div
                className="rounded-lg overflow-hidden mt-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
              >
                <FieldRow
                  name="Overall MCP frames"
                  type="200 / hour"
                  desc="Every JSON-RPC frame counts. Catch-all to stop abuse."
                />
                <FieldRow
                  name="check_domain_availability"
                  type="60 / hour"
                  desc="Light, mostly cached. Same bucket as get_domain_info."
                />
                <FieldRow
                  name="get_domain_info"
                  type="60 / hour"
                  desc="Light, mostly cached."
                />
                <FieldRow
                  name="search_domains"
                  type="20 / hour"
                  desc="Each call scrapes all 6 registrars. Most expensive."
                />
                <FieldRow
                  name="valuate_domain"
                  type="20 / hour"
                  desc="Calls Gemini on cache miss. Repeat valuations are free."
                />
              </div>

              <ul className="list-disc list-inside space-y-1.5 mt-4 opacity-80">
                <li>Windows are rolling-hour, starting from your first request</li>
                <li>Going over returns an error your AI can read and explain — no silent drop</li>
                <li>Repeat lookups of the same domain hit the Postgres cache (sub-100ms) and burn nothing extra</li>
                <li>Need higher limits? Open an issue on{" "}
                  <a
                    className="underline"
                    style={{ color: "var(--accent)" }}
                    href="https://github.com/adipundir/donadomains/issues"
                  >
                    GitHub
                  </a>{" "}
                  — we&apos;ll plan a self-service tier when there&apos;s demand.
                </li>
              </ul>
            </Section>

            {/* Examples */}
            <Section id="examples" title="Examples">
              <p className="opacity-80 mb-3">
                Once installed, talk to your AI normally. It picks the right tool for you.
              </p>
              <TabbedCode
                tabs={[
                  {
                    label: "Availability",
                    code: `You: is ad402.sh available?
AI:  (calls check_domain_availability)
     ad402.sh is TAKEN — registered with Spaceship, Inc.,
     expires 2027-03-18. Nameservers point to Cloudflare.`,
                  },
                  {
                    label: "Brand search",
                    code: `You: find me a cheap .io domain for a craft-beer brand
AI:  (calls search_domains with keyword="craftbeer", tldFilter=".io")
     5 available:
       • craftbeer.io        $39.99 / yr at Namecheap
       • mycraftbeer.io      $34.99 / yr at Porkbun
       • craftbeerlab.io     $29.99 / yr at Dynadot
       ...`,
                  },
                  {
                    label: "Ownership",
                    code: `You: who owns github.com and when does it expire?
AI:  (calls get_domain_info with domain="github.com")
     Registered with MarkMonitor Inc. since 2007-10-09.
     Expires 2026-10-09 (renewed annually).
     Nameservers: dns1.p08.nsone.net + 7 others (NS1 + AWS).
     Status: clientDeleteProhibited, clientTransferProhibited,
     clientUpdateProhibited.`,
                  },
                  {
                    label: "Valuation",
                    code: `You: what's crypto.com worth?
AI:  (calls valuate_domain with domain="crypto.com")
     ULTRA tier (score 96/100). Estimated value: $500M+.
     Reasoning: A flagship .com matching a top-tier
     commercial keyword. Single-word, dictionary, brandable,
     sold publicly for $12M in 2018 and now central to a
     multi-billion-dollar fintech ecosystem.`,
                  },
                ]}
              />
            </Section>

            {/* Troubleshooting */}
            <Section id="troubleshooting" title="Troubleshooting">
              <p className="opacity-80 mb-3">Common issues and fixes:</p>

              <div className="space-y-4">
                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                >
                  <p className="font-comic-title text-sm uppercase tracking-wide mb-1">
                    My client doesn&apos;t accept a URL
                  </p>
                  <p className="opacity-80 text-sm">
                    Donadomains MCP is HTTP-only today. If your MCP client is stdio-only, please
                    upgrade it — current versions of Claude Desktop, Cursor, Continue, Windsurf,
                    and Zed all support the Streamable HTTP transport. A stdio-transport package
                    is on the roadmap; track progress on{" "}
                    <a
                      className="underline"
                      style={{ color: "var(--accent)" }}
                      href="https://github.com/adipundir/donadomains/issues"
                    >
                      GitHub issues
                    </a>
                    .
                  </p>
                </div>

                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                >
                  <p className="font-comic-title text-sm uppercase tracking-wide mb-1">
                    Tool calls return &quot;Rate limit exceeded&quot;
                  </p>
                  <p className="opacity-80 text-sm">
                    You&apos;ve hit the per-IP cap (see Rate Limits above). Wait until the
                    rolling-hour window resets, or come back from a different network. The
                    error is surfaced as a normal tool result so the AI can explain it.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                >
                  <p className="font-comic-title text-sm uppercase tracking-wide mb-1">
                    I&apos;m on a corporate network and we share an IP
                  </p>
                  <p className="opacity-80 text-sm">
                    Per-IP buckets mean a busy network shares its quota. If this affects you,
                    please file an issue with your use case — we&apos;ll prioritize the
                    self-service higher-limit tier.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                >
                  <p className="font-comic-title text-sm uppercase tracking-wide mb-1">
                    Search results seem slow
                  </p>
                  <p className="opacity-80 text-sm">
                    <code>search_domains</code> scrapes 6 registrar sites in parallel — first call
                    for a new keyword can take 5-15 seconds. Repeat searches and{" "}
                    <code>get_domain_info</code> lookups are cached and return in &lt;100ms.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
                >
                  <p className="font-comic-title text-sm uppercase tracking-wide mb-1">
                    Something else broken?
                  </p>
                  <p className="opacity-80 text-sm">
                    Open an issue at{" "}
                    <a
                      className="underline"
                      style={{ color: "var(--accent)" }}
                      href="https://github.com/adipundir/donadomains/issues"
                    >
                      github.com/adipundir/donadomains
                    </a>
                    .
                  </p>
                </div>
              </div>
            </Section>

            {/* Footer */}
            <div
              className="pt-8 mt-8 text-center font-comic-body text-sm opacity-50"
              style={{ borderTop: "1px solid var(--border-light)" }}
            >
              Donadomains MCP · Built with{" "}
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
