# Donadomains

**Deep domain intelligence — cheapest prices, full RDAP/DNS intel, and expiry alerts, all in one search.**

Donadomains aggregates real-time domain pricing from 8+ registrars, provides deep intelligence on taken domains — registrar, dates, nameservers, status codes — and watches them for you.

Live at [donadomains.xyz](https://donadomains.xyz) | [API Docs](https://donadomains.xyz/docs) | Product of [Donalabs](https://donalabs.com)

## What it does

### Search & Compare Prices
Enter a keyword like `donataxes` or a full domain like `myproject.io`. Donadomains scrapes 8+ registrar search pages in parallel — GoDaddy, Namecheap, Porkbun, Spaceship, Squarespace, Dynadot, Name.com, and more — and shows you live pricing from each one, with the cheapest highlighted. Results stream in progressively as each registrar responds.

### Deep Domain Intelligence
For any taken domain, Donadomains pulls together data from multiple sources — RDAP registries, port-43 WHOIS (covers RDAP-less ccTLDs like `.sh`, `.io`, `.ac`), DNS records, and web scraping as a last-resort fallback — to give you the full picture: registrar, registration and expiry dates, nameservers, DNSSEC status, status codes, and any public registrant or contact information. Postgres-backed read-through cache with adaptive TTLs keeps repeat lookups sub-100ms.

### Domain Watch
Want a domain that's already taken? Watch it. Donadomains monitors it on smart intervals based on how close it is to expiry — every 2 hours for domains in pending delete, every 4 hours near expiry, daily or weekly otherwise — and emails you the moment it becomes available again.

## API

No authentication required.

```bash
# Search domains and compare prices across registrars
curl "https://donadomains.xyz/api/search?q=myproject"

# Get deep intelligence on a single domain
curl "https://donadomains.xyz/api/domain/github.com"

# AI-powered valuation
curl "https://donadomains.xyz/api/valuate/crypto.com"
```

### MCP Server (for AI agents)

Use Donadomains directly from Claude Desktop, Cursor, Continue, Windsurf, Zed, or any MCP-aware client. Add this to your config:

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

Then ask your AI: *"is ad402.sh available?"*, *"find me cheap .io domains for craftbeer"*, *"who owns github.com and when does it expire?"*. See [`mcp/README.md`](./mcp/README.md) for per-client setup.

### AI Agent Discovery

- OpenAPI spec: [donadomains.xyz/openapi.json](https://donadomains.xyz/openapi.json)
- LLM reference: [donadomains.xyz/llms.txt](https://donadomains.xyz/llms.txt)
- Full reference: [donadomains.xyz/llms-full.txt](https://donadomains.xyz/llms-full.txt)
- AI plugin manifest: [donadomains.xyz/.well-known/ai-plugin.json](https://donadomains.xyz/.well-known/ai-plugin.json)

Full interactive docs at [donadomains.xyz/docs](https://donadomains.xyz/docs).

## Tech Stack

- **Next.js 16** (App Router), React, TypeScript, Tailwind CSS
- **Firecrawl** for JS-heavy registrar page scraping
- **RDAP** (via IANA bootstrap) + **port-43 WHOIS** (via `node:net`) + **DNS-over-HTTPS** (Cloudflare) for layered domain intelligence
- **Neon Postgres** + **Drizzle ORM** for watch system storage and the domain intel cache
- **Inngest** for background job scheduling (domain watch checks)
- **Brevo** for email notifications
- **MCP** (`@modelcontextprotocol/sdk`) — stdio MCP server in [`mcp/`](./mcp), distributed as `donadomains-mcp` on npm

## License

Private / All rights reserved.
