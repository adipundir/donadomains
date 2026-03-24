# Donadomains

**Domain search aggregator that compares prices across 6 registrars in real-time.** Find the cheapest place to buy any domain, or look up who owns it.

Live at [donadomains.xyz](https://donadomains.xyz) | [API Docs](https://donadomains.xyz/docs) | Product of [Donalabs](https://donalabs.com)

## What it does

- **Search & compare** — Enter a keyword like `myproject` or a full domain like `myproject.io`. Donadomains scrapes 6 registrar search pages in parallel and shows you live pricing from each one, with the cheapest highlighted.
- **6 registrars** — GoDaddy, Namecheap, Dynadot, Hover, Name.com, Porkbun. All scraped in real-time via [Firecrawl](https://firecrawl.dev).
- **Streaming results** — Results arrive progressively via SSE as each registrar completes. Fast registrars show up in ~2-5 seconds.
- **Domain intelligence** — For any domain, get detailed RDAP + DNS info: registrar, creation/expiry dates, nameservers, DNSSEC status, registrant info.
- **Domain watch** — Monitor taken domains and get an email when they become available.

## API

Free, no authentication required. Two endpoints:

```bash
# Search domains and compare prices
curl "https://donadomains.xyz/api/search?q=myproject"

# Get detailed info on a single domain
curl "https://donadomains.xyz/api/domain/github.com"
```

**For AI agents:**
- OpenAPI spec: [donadomains.xyz/openapi.json](https://donadomains.xyz/openapi.json)
- LLM reference: [donadomains.xyz/llms.txt](https://donadomains.xyz/llms.txt)
- Full reference: [donadomains.xyz/llms-full.txt](https://donadomains.xyz/llms-full.txt)
- AI plugin manifest: [donadomains.xyz/.well-known/ai-plugin.json](https://donadomains.xyz/.well-known/ai-plugin.json)

Full interactive docs at [donadomains.xyz/docs](https://donadomains.xyz/docs).

## Tech stack

- **Next.js 16** (App Router), React, TypeScript, Tailwind CSS
- **Firecrawl** for JS-heavy registrar page scraping
- **RDAP** (via IANA bootstrap) + **DNS-over-HTTPS** (Cloudflare) for domain intelligence
- **Neon Postgres** + **Drizzle ORM** for watch system storage
- **Inngest** for background job scheduling (domain watch checks)
- **Brevo** for email notifications
- SSE streaming for progressive search results

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

**Required:**
- `FIRECRAWL_API_KEY` — For registrar scraping. Get a key at [firecrawl.dev](https://firecrawl.dev)

**For domain watch system (optional):**
- `DATABASE_URL` — Neon Postgres connection string
- `BREVO_API_KEY` — Email notifications via Brevo
- `EMAIL_FROM` — Sender address (e.g. `"Donadomains <notify@donadomains.xyz>"`)
- `NEXT_PUBLIC_APP_URL` — Base URL for email links (falls back to `VERCEL_URL`)
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Set automatically by Inngest Vercel integration

**Debug:**
- `DEBUG_SCRAPE=1` — Log raw Firecrawl markdown and parsed hits
- `LOG_RDAP=1` — Log RDAP request/response details

## Build

```bash
npm run build
npm start
```

## License

Private / All rights reserved.
