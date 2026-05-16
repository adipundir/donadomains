import { ThemeSwitcher, SidebarNav, CopyDocsButton } from "./components";
import { InstallPicker } from "./InstallPicker";

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
                Domain search, intel, and AI valuation, available to your AI agent.
              </p>
              <p className="font-comic-body text-sm opacity-60 mt-2">
                Free. No signup. No API key.
              </p>
            </div>

            {/* Install */}
            <Section id="install" title="Install">
              <InstallPicker />
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
                    <code className="font-mono text-sm font-semibold text-[var(--green)]">check_domain_availability</code>
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
                    <code className="font-mono text-sm font-semibold text-[var(--green)]">search_domains</code>
                  </div>
                  <p className="opacity-80 text-sm">
                    Find available domains for a keyword across multiple registrars,
                    with live pricing. Best for brand or project naming.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <code className="font-mono text-sm font-semibold text-[var(--green)]">get_domain_info</code>
                  </div>
                  <p className="opacity-80 text-sm">
                    Detailed registration info for a domain: registrar, dates,
                    nameservers, status codes, DNSSEC.
                  </p>
                </div>

                <div
                  className="rounded-lg p-4 comic-border-subtle"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <code className="font-mono text-sm font-semibold text-[var(--green)]">valuate_domain</code>
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
                Free. Rate-limited per source IP.
              </p>

              <div
                className="rounded-lg overflow-hidden mt-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}
              >
                <FieldRow name="Overall MCP calls" type="200 / hour" desc="" />
                <FieldRow name="check_domain_availability" type="60 / hour" desc="" />
                <FieldRow name="get_domain_info" type="60 / hour" desc="" />
                <FieldRow name="search_domains" type="20 / hour" desc="" />
                <FieldRow name="valuate_domain" type="20 / hour" desc="" />
              </div>

              <p className="opacity-70 text-sm mt-4">
                Windows are rolling-hour from your first request. Exceeding a limit
                returns an error your AI can read and explain.
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

          </main>
        </div>
      </div>
    </div>
  );
}
