import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";

const NAME = "GoDaddy";

// GoDaddy's website is behind Akamai bot protection that Firecrawl (even with
// stealth proxy + long timeouts) cannot bypass. We use the official Domains
// API instead — auth'd via SSO key, free tier, supports bulk lookups.
//
// Get keys from https://developer.godaddy.com (instant, no reseller needed).
// Set in .env:
//   GODADDY_API_KEY=<your key>
//   GODADDY_API_SECRET=<your secret>
const API_BULK_URL = "https://api.godaddy.com/v1/domains/available?checkType=FULL&forTransfer=false";
const API_TIMEOUT_MS = 15_000;

/**
 * TLDs we ask GoDaddy to price + verify. Mirrors the popular gTLDs other
 * registrars naturally surface — keeps result coverage comparable.
 */
const TLDS = [
  "com", "net", "org", "io", "co", "dev", "app", "ai", "xyz", "me",
  "info", "biz", "us", "tv", "online", "site", "tech", "store", "shop",
  "club", "pro", "cloud", "live", "world",
];

interface GoDaddyAvailability {
  available: boolean;
  currency: string;
  domain: string;
  period?: number;
  /** Price in micros: divide by 1_000_000 for USD. */
  price?: number;
  definitive?: boolean;
}

interface GoDaddyBulkResponse {
  domains: GoDaddyAvailability[];
}

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const start = Date.now();
  const key = process.env.GODADDY_API_KEY;
  const secret = process.env.GODADDY_API_SECRET;

  if (!key || !secret) {
    return {
      registrar: NAME,
      hits: [],
      fetchTimeMs: 0,
      error: "GODADDY_API_KEY + GODADDY_API_SECRET missing — get from developer.godaddy.com",
    };
  }

  const keyword = query.replace(/\..+$/, "").toLowerCase().trim();
  if (!keyword) {
    return { registrar: NAME, hits: [], fetchTimeMs: 0 };
  }

  // If the user typed a full domain with a non-popular TLD, include it too.
  const tldMatch = query.match(/\.([a-z]{2,})(?:\.[a-z]{2,})?$/i);
  const userTld = tldMatch?.[1].toLowerCase();
  const tlds = userTld && !TLDS.includes(userTld) ? [userTld, ...TLDS] : TLDS;

  const domains = tlds.map((t) => `${keyword}.${t}`);

  console.log(`[${NAME}] Checking ${domains.length} TLDs via API`);

  try {
    const res = await fetch(API_BULK_URL, {
      method: "POST",
      headers: {
        Authorization: `sso-key ${key}:${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(domains),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    const elapsed = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      const msg = `HTTP ${res.status} — ${body.slice(0, 200)}`;
      console.log(`[${NAME}] FAILED in ${elapsed}ms — ${msg}`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: msg };
    }

    const data = (await res.json()) as GoDaddyBulkResponse;
    const hits: RegistrarSearchHit[] = [];

    for (const d of data.domains ?? []) {
      // Skip non-definitive responses (GoDaddy isn't sure)
      if (d.definitive === false) continue;
      // Skip non-USD currency to match the rest of the pipeline
      if (d.currency && d.currency !== "USD") continue;

      const priceUsd = d.price != null ? d.price / 1_000_000 : undefined;
      const isPremium = priceUsd != null && priceUsd >= 500;

      hits.push({
        domain: d.domain.toLowerCase(),
        available: d.available && !isPremium,
        explicitlyTaken: !d.available ? true : undefined,
        premium: isPremium || undefined,
        registration: priceUsd,
        currency: "USD",
        buyUrl: buildBuyUrl(d.domain),
      });
    }

    const avail = hits.filter((h) => h.available && !h.premium);
    const taken = hits.filter((h) => !h.available && !h.premium);
    const premium = hits.filter((h) => h.premium);
    console.log(`[${NAME}] OK in ${elapsed}ms — ${hits.length} total · ${avail.length} avail · ${taken.length} taken · ${premium.length} premium`);

    if (avail.length > 0) {
      const sample = avail.slice(0, 3).map((h) => `${h.domain} ($${h.registration ?? "?"})`).join(", ");
      console.log(`[${NAME}] Sample: ${sample}`);
    }

    return { registrar: NAME, hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = (err as Error).message;
    console.log(`[${NAME}] EXCEPTION in ${elapsed}ms — ${msg}`);
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: msg };
  }
}

function buildBuyUrl(domain: string): string {
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(domain)}`;
}

const godaddy: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default godaddy;
