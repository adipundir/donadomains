# Donadomains

**Deep domain intelligence — cheapest prices, full RDAP/DNS intel, and expiry alerts, all in one search.**

Donadomains aggregates real-time domain pricing from 8+ registrars, provides deep intelligence on taken domains — registrar, dates, nameservers, status codes — and watches them for you. Also available as an x402 pay-per-request API for AI agents on Starknet.

Live at [donadomains.xyz](https://donadomains.xyz) | [API Docs](https://donadomains.xyz/docs) | Product of [Donalabs](https://donalabs.com)

## What it does

### Search & Compare Prices
Enter a keyword like `donataxes` or a full domain like `myproject.io`. Donadomains scrapes 8+ registrar search pages in parallel — GoDaddy, Namecheap, Porkbun, Spaceship, Squarespace, Dynadot, Name.com, and more — and shows you live pricing from each one, with the cheapest highlighted. Results stream in progressively as each registrar responds.

### Deep Domain Intelligence
For any taken domain, Donadomains pulls together data from multiple sources — RDAP registries, DNS records, and web scraping as a fallback — to give you the full picture: registrar, registration and expiry dates, nameservers, DNSSEC status, RDAP status codes, and any public registrant or contact information.

### Domain Watch
Want a domain that's already taken? Watch it. Donadomains monitors it on smart intervals based on how close it is to expiry — every 2 hours for domains in pending delete, every 4 hours near expiry, daily or weekly otherwise — and emails you the moment it becomes available again.

### x402 Paid API for AI Agents
AI agents can access all of this programmatically through x402-protected endpoints on Starknet. No API keys, no accounts — just pay per request in USDC. No rate limits.

## API

### Free Endpoints

No authentication required.

```bash
# Search domains and compare prices across registrars
curl "https://donadomains.xyz/api/search?q=myproject"

# Get deep intelligence on a single domain
curl "https://donadomains.xyz/api/domain/github.com"
```

### Paid Endpoints (x402 on Starknet)

Pay-per-request via Starknet wallet. No rate limits.

```bash
# Search — 0.01 USDC per request
/api/paid/search?q={keyword}

# Domain intel — 0.005 USDC per request
/api/paid/domain/{domain}
```

### AI Agent Discovery

- OpenAPI spec: [donadomains.xyz/openapi.json](https://donadomains.xyz/openapi.json)
- LLM reference: [donadomains.xyz/llms.txt](https://donadomains.xyz/llms.txt)
- Full reference: [donadomains.xyz/llms-full.txt](https://donadomains.xyz/llms-full.txt)
- AI plugin manifest: [donadomains.xyz/.well-known/ai-plugin.json](https://donadomains.xyz/.well-known/ai-plugin.json)

Full interactive docs at [donadomains.xyz/docs](https://donadomains.xyz/docs).

## Tech Stack

- **Next.js 16** (App Router), React, TypeScript, Tailwind CSS
- **Firecrawl** for JS-heavy registrar page scraping
- **RDAP** (via IANA bootstrap) + **DNS-over-HTTPS** (Cloudflare) for domain intelligence
- **Neon Postgres** + **Drizzle ORM** for watch system storage
- **Inngest** for background job scheduling (domain watch checks)
- **Brevo** for email notifications
- **x402 on Starknet** for paid API payment protocol

## License

Private / All rights reserved.
