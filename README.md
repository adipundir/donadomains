# Donadomains

**Donadomains** is a domain search tool that checks whether a domain name is available or taken, and shows you where to buy it. You enter a keyword or a full domain (e.g. `myname` or `myname.com`); the app checks availability across many TLDs, shows exact and similar name suggestions, and for taken domains shows registration details (when registries provide them). Every result includes links to compare prices at GoDaddy, Namecheap, Squarespace, Cloudflare, and Porkbun.

**Product of [Donalabs](https://donalabs.com).**

## What it does

- **Availability check** — You type a keyword or domain. The app checks availability by querying **registry RDAP servers** (using the IANA RDAP bootstrap to find the right server per TLD) and **DNS**. If the registry is unreachable, it falls back to rdap.org. No scraping; data comes from the same sources registrars use.
- **Many TLDs and variants** — It checks **20 exact TLDs** (e.g. .com, .net, .org, .io, .co, .dev, .app, .ai, .xyz, .me, .info, .biz, .us, .tv, .online, .site, .tech, .store, .club, .world) for your keyword, plus **similar names** (e.g. keyword+online, my+keyword) for .com, .net, and .org.
- **Taken domain details** — For domains that are taken, it shows **who bought it** (registrant), **from which registrar**, **contact** (if present), **registered date**, and **expiry date**. Many registries redact this for privacy, so you may only see dates.
- **Compare prices** — Each result has links to **GoDaddy**, **Namecheap**, **Squarespace**, **Cloudflare**, and **Porkbun** so you can compare prices and purchase there.

## Tech stack

- **Next.js** (App Router), **React**, **TypeScript**, **Tailwind CSS**
- **RDAP** (registry) + **DNS** for availability and registration data; IANA bootstrap for registry URLs; fallback to rdap.org on failure
- **Server Actions** for all search logic (no public API)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a keyword or domain, and search.

### Environment (optional)

No env vars required. Optional:

- `GODADDY_KEY` / `GODADDY_SECRET` — GoDaddy API for per-domain pricing (production requires 50+ domains).
- `NAMECHEAP_API_USER` / `NAMECHEAP_API_KEY` / `NAMECHEAP_API_IP` — Namecheap API for TLD pricing (whitelist IP in Namecheap account).
- `BROWSERLESS_TOKEN` — Enables Browserless for all scrapers (GoDaddy, Namecheap, Squarespace, Cloudflare). GoDaddy uses Akamai; Browserless bypasses it. Get a token at [browserless.io](https://www.browserless.io/) (free tier: 1000 runs/mo).
- `BROWSERLESS_PROXY` — Set to `residential` to use residential proxy (required for GoDaddy).
- `BROWSERLESS_URL` — Override WSS URL; otherwise derived from token.
- `SAVE_SCRAPER_HTML=1` — Debug: save HTML when scraping fails (writes to `/tmp`).

Pricing sources (all server-side): Porkbun (public API), GoDaddy (API or scrape), Namecheap (API or scrape).

## Build

```bash
npm run build
npm start
```

## License

Private / All rights reserved.
