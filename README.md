# Donadomains MCP

Domain search, WHOIS, and AI valuation, available to your AI agent over the Model Context Protocol.

Free. No signup. No API key.

Live at [donadomains.xyz](https://donadomains.xyz). Docs at [donadomains.xyz/docs](https://www.donadomains.xyz/docs).

## Install

**Claude Code CLI:**

```bash
claude mcp add --transport http donadomains https://www.donadomains.xyz/api/mcp
```

**Any other MCP client** (Claude Desktop, Claude.ai Connectors, Cursor, Continue, Windsurf, Zed) add this to your MCP server config:

```json
{
  "mcpServers": {
    "donadomains": {
      "type": "http",
      "url": "https://www.donadomains.xyz/api/mcp"
    }
  }
}
```

Config file locations:
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: Settings, MCP
- Claude.ai web: Settings, Connectors, Add custom

## Tools

| Tool | Purpose |
|---|---|
| `check_domain_availability` | Is a domain free? If yes, lowest price + buy link. If no, owner info. |
| `search_domains` | Find available domains for a keyword across 6 registrars. |
| `get_domain_info` | WHOIS, RDAP, DNS intel for a registered domain. |
| `valuate_domain` | AI-powered USD valuation with reasoning. |

## Rate limits (free, per source IP, IPv6 counted by /64)

| Bucket | Limit |
|---|---|
| Overall MCP calls | 200 / hour |
| `check_domain_availability`, `get_domain_info` | 60 / hour each |
| `search_domains` | 20 / hour |
| `valuate_domain` | 20 / hour |

Repeat lookups of the same domain hit the Postgres cache and don't burn extra quota. Need higher limits? [Open an issue](https://github.com/adipundir/donadomains/issues).

## How it works

For any taken domain, four data sources are layered to fill in the full picture (registrar, dates, nameservers, DNSSEC, status codes, public registrant info):

1. **RDAP** via IANA bootstrap, for TLDs that publish one.
2. **Port-43 WHOIS** via `node:net`, for RDAP-less ccTLDs like `.sh`, `.io`, `.ac`.
3. **DNS-over-HTTPS** via Cloudflare, for nameservers and resolution.
4. **who.is scrape** via Firecrawl, as last-resort fallback.

Postgres-backed read-through cache with adaptive TTLs keeps repeat lookups sub-100ms.

## Tech stack

- Next.js 16, React, TypeScript, Tailwind CSS, hosted on Vercel
- `@modelcontextprotocol/sdk` Streamable HTTP at `/api/mcp`
- Firecrawl for registrar page scraping
- RDAP, port-43 WHOIS, DNS-over-HTTPS for layered intel
- Neon Postgres + Drizzle ORM for cache, rate limits, watch system
- Inngest for background jobs
- Brevo for email notifications
- Gemini 2.0 Flash for valuation

## Repo layout

```
.
├── app/                ← Next.js app + MCP HTTP route
│   ├── api/mcp/        ← Streamable HTTP MCP endpoint
│   ├── lib/whois/      ← Port-43 WHOIS client
│   ├── lib/mcp-tools/  ← In-app MCP tool handlers
│   └── lib/intel-cache.ts
├── mcp/                ← Source for a future stdio package (not yet on npm)
├── drizzle/            ← Migrations
└── Makefile            ← install / build / test / publish / clean
```

## License

MIT
