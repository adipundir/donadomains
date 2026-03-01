# Donadomains

Search domain availability and compare registrar prices in one place.

Check if a domain is available using registry data (RDAP/DNS), see exact and similar name suggestions, and get direct links to compare prices at GoDaddy, Namecheap, Squarespace, Cloudflare, and Porkbun.

**Product of [Donalabs](https://donalabs.com).**

## Features

- **Domain search** — Enter a keyword or full domain (e.g. `myname.com`); we parse it and check availability across 20+ TLDs.
- **Exact + similar names** — Results include exact matches (keyword + TLD) and similar variants (e.g. keyword+online, my+keyword) for .com, .net, .org.
- **Registry-only data** — Availability and registration details (registrar, created, expires, registrant) come from RDAP/DNS; no scraping.
- **Compare prices** — Each result links to multiple registrars so you can compare where to buy the same domain.
- **Taken domain details** — For taken domains, see who registered it, when it expires, and current registrar (when not redacted).

## Tech stack

- **Next.js** (App Router), **React**, **TypeScript**, **Tailwind CSS**
- **RDAP** + **DNS** for availability and registration data
- **Server Actions** for all search logic (no public API)

## Getting started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter a keyword or domain and search.

### Environment (optional)

No env vars required. Optional:

- `GODADDY_KEY` / `GODADDY_SECRET` — Not used in current registry-only flow; reserved for future optional GoDaddy API pricing.

## Build

```bash
npm run build
npm start
```

## License

Private / All rights reserved.
