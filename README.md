# Donadomains MCP

**Real-time domain superpowers for your AI agent — availability, prices across 6 registrars, full WHOIS/RDAP intel, and AI valuation. Free, no signup, no API key.**

Live at [donadomains.xyz](https://donadomains.xyz) · [MCP Docs](https://donadomains.xyz/docs) · Product of [Donalabs](https://donalabs.com)

## Install (pick whichever your client supports)

**Option A — URL** (recommended; works in Claude Desktop ≥ 0.7, Claude.ai web Connectors, Cursor ≥ 0.41, Windsurf, Continue, Zed):

```json
{
  "mcpServers": {
    "donadomains": {
      "url": "https://donadomains.xyz/api/mcp"
    }
  }
}
```

**Option B — npx** (stdio fallback; requires Node.js ≥ 18):

```json
{
  "mcpServers": {
    "donadomains": {
      "command": "npx",
      "args": ["-y", "donadomains-mcp"]
    }
  }
}
```

Per-client config locations (Claude Desktop, Cursor, Continue, Windsurf, Zed) are in [`mcp/README.md`](./mcp/README.md).

## What your AI can do

- `check_domain_availability` — is `donataxes.com` free? Who owns it if not?
- `search_domains` — find available domains across 6 registrars with live pricing
- `get_domain_info` — WHOIS / RDAP / DNS intel for any TLD (yes, including `.sh`, `.io`, `.ac`)
- `valuate_domain` — AI-powered USD valuation with reasoning + per-factor breakdown

Then just ask: *"is ad402.sh available?"*, *"find me a cheap .io domain for craftbeer"*, *"who owns github.com?"*, *"what's crypto.com worth?"*

## Rate limits (free, per-IP, IPv6 normalized to /64)

| Bucket | Limit |
|---|---|
| Overall MCP frames | 200 / hour |
| `check_domain_availability` / `get_domain_info` | 60 / hour (cached, light) |
| `search_domains` | 20 / hour (scrapes 6 registrars) |
| `valuate_domain` | 20 / hour (Gemini on cache miss) |

Repeat lookups of the same domain hit the Postgres cache (~sub-100ms) and don't burn additional quota. Need higher limits? [Open an issue](https://github.com/adipundir/donadomains/issues) — we'll plan a self-service tier when there's demand.

## How it works under the hood

For any taken domain, Donadomains layers four data sources to give you the full picture — registrar, registration and expiry dates, nameservers, DNSSEC status, status codes, and any public registrant or contact information:

1. **RDAP** (via IANA bootstrap, cached) for the ~500 TLDs that publish one
2. **Port-43 WHOIS** (via `node:net`) for RDAP-less ccTLDs like `.sh`, `.io`, `.ac`, `.ws`
3. **DNS-over-HTTPS** (Cloudflare) for nameservers and resolution confirmation
4. **who.is scrape** (Firecrawl) as last-resort fallback

Postgres-backed read-through cache with adaptive TTLs keeps repeat lookups sub-100ms.

## Tech stack

- **Next.js 16** (App Router), React, TypeScript, Tailwind CSS — hosted on Vercel
- **Model Context Protocol** (`@modelcontextprotocol/sdk`) — Streamable HTTP at `/api/mcp` + stdio via `donadomains-mcp` on npm
- **Firecrawl** for JS-heavy registrar page scraping
- **RDAP** + **port-43 WHOIS** + **DNS-over-HTTPS** for layered intelligence
- **Neon Postgres** + **Drizzle ORM** for the intel cache, rate limits, and watch system
- **Inngest** for background job scheduling
- **Brevo** for email notifications
- **Gemini 2.0 Flash** for domain valuation

## Repo layout

```
.
├── app/                ← Next.js app (web search UI + MCP HTTP route + REST handlers)
│   ├── api/mcp/        ← Streamable HTTP MCP endpoint
│   ├── lib/whois/      ← Port-43 WHOIS client + IANA discovery + parser
│   ├── lib/mcp-tools/  ← In-app MCP tool handlers
│   └── lib/intel-cache.ts
├── mcp/                ← donadomains-mcp npm package (stdio fallback)
├── drizzle/            ← Migrations
└── Makefile            ← install / build / test / publish / clean
```

## License

MIT
