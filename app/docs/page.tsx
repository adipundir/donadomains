import { ThemeSwitcher, CodeBlock, TabbedCode, SidebarNav, CopyDocsButton } from "./components";

function Badge({ children, color = "accent" }: { children: React.ReactNode; color?: "accent" | "green" }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-bold rounded font-comic-body"
      style={{
        background: color === "green" ? "var(--green)" : "var(--accent)",
        color: color === "green" ? "#fff" : "var(--border)",
      }}
    >
      {children}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-bold rounded font-comic-body mr-2"
      style={{ background: "var(--green)", color: "#fff" }}
    >
      {method}
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

const EXAMPLE_INTEL_RESPONSE = `{
  "domain": "example.com",
  "registered": true,
  "status": [
    "client delete prohibited",
    "client transfer prohibited",
    "client update prohibited"
  ],
  "created": "1995-08-14T04:00:00Z",
  "updated": "2024-08-14T07:01:44Z",
  "expires": "2025-08-13T04:00:00Z",
  "registrar": "RESERVED-Internet Assigned Numbers Authority",
  "nameservers": [
    "a.iana-servers.net",
    "b.iana-servers.net"
  ],
  "sources": ["rdap", "dns"],
  "timing": {
    "rdap": 342,
    "dns": 87
  }
}`;

const EXAMPLE_SEARCH_JSON = `{
  "keyword": "example",
  "tld": null,
  "results": [
    {
      "domain": "example.xyz",
      "available": true,
      "tld": ".xyz",
      "matchType": "exact",
      "buyLinks": [
        {
          "name": "Dynadot",
          "url": "https://dynadot.com/...",
          "price": "$13.17/yr",
          "priceNum": 13.17,
          "source": "scraped"
        },
        {
          "name": "GoDaddy",
          "url": "https://godaddy.com/...",
          "price": "$0.99/yr",
          "priceNum": 0.99,
          "isCheapest": true,
          "source": "scraped"
        }
      ],
      "registerUrl": "https://godaddy.com/..."
    },
    {
      "domain": "example.com",
      "available": false,
      "tld": ".com",
      "matchType": "exact",
      "buyLinks": []
    }
  ],
  "sources": [
    { "name": "Dynadot", "status": "ok", "count": 45 },
    { "name": "Name.com", "status": "ok", "count": 27 },
    { "name": "GoDaddy", "status": "ok", "count": 33 },
    { "name": "Namecheap", "status": "ok", "count": 6 },
    { "name": "Hover", "status": "ok", "count": 490 },
    { "name": "Porkbun", "status": "failed", "count": 0 }
  ]
}`;

const NAV_ITEMS = [
  { id: "domain-search", label: "Search" },
  { id: "domain-info", label: "Info" },
  { id: "rate-limits", label: "Rate Limits" },
];

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
              API
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
          {/* Intro */}
          <div>
            <h1 className="font-comic-title text-3xl sm:text-4xl uppercase tracking-wide mb-3">
              API <span style={{ color: "var(--accent)" }}>Docs</span>
            </h1>
            <p className="font-comic-body text-base opacity-70 max-w-2xl">
              Free, unauthenticated API for domain search and intelligence.
              Search across 6 registrars for live pricing, or look up detailed RDAP/DNS info for any domain.
            </p>
          </div>

          {/* Endpoints overview */}
          <div className="rounded-lg p-5 space-y-4" style={{ background: "var(--surface)", border: "2px solid var(--border-light)" }}>
            <div>
              <p className="font-comic-title text-lg uppercase tracking-wide">2 Endpoints. That&apos;s it.</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "var(--surface-muted)" }}>
              <p className="font-comic-title text-[10px] uppercase tracking-widest opacity-50 mb-1">Base URL</p>
              <code className="text-base font-bold">https://donadomains.xyz</code>
            </div>
            <div className="space-y-2">
              <a
                href="#domain-search"
                className="flex items-start gap-3 p-3 rounded-lg transition-colors hover:opacity-80"
                style={{ background: "var(--surface-muted)" }}
              >
                <Badge color="green">GET</Badge>
                <div>
                  <code className="text-sm font-bold">/api/search?q=&#123;keyword&#125;</code>
                  <p className="font-comic-body text-sm opacity-70 mt-0.5">Search domain availability and compare prices across 6 registrars.</p>
                </div>
              </a>
              <a
                href="#domain-info"
                className="flex items-start gap-3 p-3 rounded-lg transition-colors hover:opacity-80"
                style={{ background: "var(--surface-muted)" }}
              >
                <Badge color="green">GET</Badge>
                <div>
                  <code className="text-sm font-bold">/api/domain/&#123;domain&#125;</code>
                  <p className="font-comic-body text-sm opacity-70 mt-0.5">Look up detailed info for a single domain — registrar, dates, owner, nameservers, status.</p>
                </div>
              </a>
            </div>
          </div>

          {/* ── Endpoint 1: Domain Search ── */}
          <Section id="domain-search" title="Domain Search">
            <div
              className="rounded-lg p-4 comic-border-subtle"
              style={{ background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <MethodBadge method="GET" />
                <code className="text-base font-bold">/api/search?q=&#123;keyword&#125;</code>
              </div>
              <p className="opacity-70 text-sm">
                Search domain availability across 6 registrars with live pricing.
              </p>
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Parameters</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow
                name="q"
                type="string"
                desc='Search keyword. Can be a bare word (e.g. "donadomains") or a full domain (e.g. "donadomains.xyz"). Registrars dynamically discover available TLDs for the keyword.'
              />
              <FieldRow
                name="stream"
                type="string"
                desc='Set to "true" for real-time streaming via Server-Sent Events. Omit for a single JSON response.'
                optional
              />
            </div>

            {/* ── Mode 1: JSON (default) ── */}
            <div className="mt-8 p-4 rounded-lg" style={{ border: "2px solid var(--border-light)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Badge>Default</Badge>
                <h3 className="font-comic-title text-lg">JSON Response</h3>
              </div>
              <p className="opacity-70 text-sm mb-4">
                Waits for all registrars to respond, then returns a single JSON object. Takes 5-15 seconds. Best for scripts, bots, and backend integrations.
              </p>

              <CodeBlock title="curl">{`curl "https://donadomains.xyz/api/search?q=donadomains"`}</CodeBlock>
              <TabbedCode tabs={[
                { label: "JavaScript", code: `const res = await fetch(
  "https://donadomains.xyz/api/search?q=donadomains"
);
const data = await res.json();

// Available domains with pricing
const available = data.results.filter(r => r.available);
console.log(\`\${available.length} domains available\`);

// Cheapest option
const cheapest = available
  .flatMap(r => r.buyLinks ?? [])
  .find(l => l.isCheapest);
console.log(cheapest?.name, cheapest?.price);` },
                { label: "Python", code: `import requests

res = requests.get("https://donadomains.xyz/api/search", params={"q": "donadomains"})
data = res.json()

# Available domains with pricing
available = [r for r in data["results"] if r["available"]]
print(f"{len(available)} domains available")

# Cheapest option
for domain in available:
    for link in domain.get("buyLinks", []):
        if link.get("isCheapest"):
            print(f"{link['name']} — {link['price']}")` },
              ]} />

              <p className="font-comic-title text-sm mt-4 mb-2">Example Response</p>
              <CodeBlock title="JSON">{EXAMPLE_SEARCH_JSON}</CodeBlock>
            </div>

            {/* ── Mode 2: Stream ── */}
            <div className="mt-4 p-4 rounded-lg" style={{ border: "2px solid var(--border-light)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Badge color="green">Advanced</Badge>
                <h3 className="font-comic-title text-lg">Streaming Response</h3>
              </div>
              <p className="opacity-70 text-sm mb-4">
                Results arrive progressively via Server-Sent Events as each registrar completes. Registrar results stream in over 2-15 seconds. Best for building real-time UIs with progress indicators.
              </p>

              <CodeBlock title="curl">{`curl -N "https://donadomains.xyz/api/search?q=donadomains&stream=true"`}</CodeBlock>
              <TabbedCode tabs={[
                { label: "JavaScript", code: `const res = await fetch(
  "https://donadomains.xyz/api/search?q=donadomains&stream=true"
);
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const parts = buffer.split("\\n\\n");
  buffer = parts.pop() ?? "";

  for (const part of parts) {
    const line = part.split("\\n").find(l => l.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));

    if (event.type === "batch") {
      console.log(event.registrar, "done:", event.results.length, "results");
    } else if (event.type === "complete") {
      console.log("Search complete");
    }
  }
}` },
                { label: "Python", code: `import requests
import json

res = requests.get(
    "https://donadomains.xyz/api/search",
    params={"q": "donadomains", "stream": "true"},
    stream=True,
)

for line in res.iter_lines():
    line = line.decode()
    if not line.startswith("data: "):
        continue
    event = json.loads(line[6:])

    if event["type"] == "batch":
        print(f"{event['registrar']} done: {len(event['results'])} results")
    elif event["type"] == "complete":
        print("Search complete")
        break` },
              ]} />

              <p className="font-comic-title text-sm mt-4 mb-2">Event Types</p>
              <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
                <FieldRow name="init" type="event" desc="Sent first. Contains the list of registrar names being scraped (Dynadot, Name.com, GoDaddy, Namecheap, Hover, Porkbun)." />
                <FieldRow name="batch" type="event" desc="Sent each time a registrar completes. Contains the full merged results so far, plus source statuses." />
                <FieldRow name="complete" type="event" desc="All sources finished. Stream closes after this." />
              </div>
            </div>

            {/* ── Shared fields ── */}
            <h3 className="font-comic-title text-xl mt-8 mb-2">Result Fields</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow name="domain" type="string" desc="Fully qualified domain name (e.g. example.com)" />
              <FieldRow name="available" type="boolean" desc="Whether the domain is available for registration" />
              <FieldRow name="tld" type="string" desc="TLD including dot (e.g. '.com')" />
              <FieldRow name="matchType" type="string" desc='"exact" if TLD matches user query, "similar" otherwise' optional />
              <FieldRow name="buyLinks" type="BuyLink[]" desc="Purchase links from registrars with pricing (empty array for taken domains)" />
              <FieldRow name="registerUrl" type="string" desc="Direct URL to register at the cheapest registrar" optional />
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">BuyLink Fields</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow name="name" type="string" desc="Registrar name (e.g. GoDaddy, Dynadot, Hover)" />
              <FieldRow name="url" type="string" desc="Direct purchase URL — takes user to checkout" />
              <FieldRow name="price" type="string" desc='Formatted price (e.g. "$9.99/yr")' optional />
              <FieldRow name="priceNum" type="number" desc="Numeric price for sorting/comparison" optional />
              <FieldRow name="isCheapest" type="boolean" desc="True if this is the cheapest option across all registrars" optional />
              <FieldRow name="premium" type="boolean" desc="True if this is a premium/aftermarket listing" optional />
              <FieldRow name="source" type="string" desc='Always "scraped" — prices are live-scraped from registrar websites' />
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Error Responses</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow name="400" type="Bad Request" desc='Missing or invalid q parameter' />
              <FieldRow name="500" type="Server Error" desc="Unexpected internal error" />
            </div>
          </Section>

          {/* ── Endpoint 2: Domain Info ── */}
          <Section id="domain-info" title="Domain Info">
            <div
              className="rounded-lg p-4 comic-border-subtle"
              style={{ background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <MethodBadge method="GET" />
                <code className="text-base font-bold">/api/domain/&#123;domain&#125;</code>
              </div>
              <p className="opacity-70 text-sm">
                Returns comprehensive domain intelligence from RDAP, DNS-over-HTTPS, and who.is scraping.
                Layered approach fills in gaps from multiple sources.
              </p>
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Path Parameters</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow
                name="domain"
                type="string"
                desc='Fully qualified domain name (e.g. "example.com"). Must match the pattern: lowercase alphanumeric with dots/hyphens, ending in a valid TLD.'
              />
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Examples</h3>
            <CodeBlock title="curl">{`curl "https://donadomains.xyz/api/domain/example.com"`}</CodeBlock>
            <TabbedCode tabs={[
              { label: "JavaScript", code: `const res = await fetch(
  "https://donadomains.xyz/api/domain/example.com"
);
const intel = await res.json();

console.log(intel.registered);  // true
console.log(intel.registrar);   // "RESERVED-Internet Assigned Numbers Authority"
console.log(intel.nameservers); // ["a.iana-servers.net", "b.iana-servers.net"]
console.log(intel.sources);     // ["rdap", "dns"]` },
              { label: "Python", code: `import requests

res = requests.get("https://donadomains.xyz/api/domain/example.com")
intel = res.json()

print(intel["registered"])   # True
print(intel["registrar"])    # "RESERVED-Internet Assigned Numbers Authority"
print(intel["nameservers"])  # ["a.iana-servers.net", "b.iana-servers.net"]
print(intel["sources"])      # ["rdap", "dns"]` },
            ]} />

            <h3 className="font-comic-title text-xl mt-6 mb-2">Example Response</h3>
            <CodeBlock title="JSON">{EXAMPLE_INTEL_RESPONSE}</CodeBlock>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Response Fields</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow name="domain" type="string" desc="The normalized domain that was queried" />
              <FieldRow name="registered" type="boolean" desc="Whether the domain is currently registered" />
              <FieldRow name="status" type="string[]" desc="ICANN domain status codes (e.g. clientTransferProhibited)" optional />
              <FieldRow name="created" type="string" desc="Creation date (ISO 8601)" optional />
              <FieldRow name="updated" type="string" desc="Last updated date (ISO 8601)" optional />
              <FieldRow name="expires" type="string" desc="Expiration date (ISO 8601)" optional />
              <FieldRow name="registrar" type="string" desc="Name of the registrar" optional />
              <FieldRow name="registrarUrl" type="string" desc="Registrar website URL" optional />
              <FieldRow name="registrant" type="string" desc="Name of the registrant (often redacted for privacy)" optional />
              <FieldRow name="organization" type="string" desc="Registrant organization" optional />
              <FieldRow name="contactEmail" type="string" desc="Registrant contact email (only shown when not privacy-protected)" optional />
              <FieldRow name="contactPhone" type="string" desc="Contact phone number" optional />
              <FieldRow name="contactAddress" type="string" desc="Registrant address (partial, often redacted)" optional />
              <FieldRow name="nameservers" type="string[]" desc="Authoritative nameservers for the domain" optional />
              <FieldRow name="dnssec" type="string" desc='DNSSEC status (e.g. "signedDelegation")' optional />
              <FieldRow name="sources" type="string[]" desc='Data sources used: "rdap", "dns", "who.is"' />
              <FieldRow name="timing" type="object" desc="Milliseconds spent per source (e.g. { rdap: 342, dns: 87 })" />
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Error Responses</h3>
            <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
              <FieldRow name="400" type="Bad Request" desc='Invalid domain format' />
              <FieldRow name="504" type="Gateway Timeout" desc="Request took longer than 10 seconds" />
              <FieldRow name="500" type="Server Error" desc="Unexpected internal error" />
            </div>

            <h3 className="font-comic-title text-xl mt-6 mb-2">Data Sources</h3>
            <p className="opacity-80">
              Domain intelligence is gathered in layers, with each source filling gaps left by previous ones:
            </p>
            <ol className="list-decimal list-inside space-y-2 mt-2 opacity-80">
              <li>
                <strong>RDAP</strong> — Registration Data Access Protocol. Free, HTTP-based. Provides registrar, dates, status, and contact info.
              </li>
              <li>
                <strong>DNS-over-HTTPS</strong> — Cloudflare DoH queries. Fast (~50ms). Resolves nameservers and confirms resolution.
              </li>
              <li>
                <strong>who.is scrape</strong> — Firecrawl-powered fallback. Only triggered when RDAP returns almost no data. Used sparingly.
              </li>
            </ol>
          </Section>

          {/* Rate Limits */}
          <Section id="rate-limits" title="Rate Limits">
            <div
              className="rounded-lg p-4 comic-border-subtle"
              style={{ background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Badge color="accent">PUBLIC API</Badge>
              </div>
              <p className="opacity-80 mb-3">
                The API is currently free and requires no authentication. To keep things fair for everyone:
              </p>
              <ul className="list-disc list-inside space-y-1.5 opacity-80">
                <li>Be reasonable with request volume</li>
                <li>The search endpoint streams results and may take 5-15 seconds to complete</li>
                <li>The domain info endpoint has a 10 second timeout</li>
                <li>Registrar scraping is rate-limited upstream by the registrar sites themselves</li>
              </ul>
              <div
                className="mt-4 p-3 rounded-lg text-sm"
                style={{ background: "var(--accent-subtle)", border: "1px solid var(--border-light)" }}
              >
                <strong>Note:</strong> Authentication and formal rate limits may be added in the future.
                If you are building something that depends on this API, reach out so we can ensure your access is uninterrupted.
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div
            className="pt-8 mt-8 text-center font-comic-body text-sm opacity-50"
            style={{ borderTop: "1px solid var(--border-light)" }}
          >
            Donadomains API Docs
          </div>
        </main>
        </div>
      </div>
    </div>
  );
}
