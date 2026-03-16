import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";

const NAME = "Cloudflare";
const PRICING_URL = "https://raw.githubusercontent.com/Cloudflare-Mining/Cloudflare-Datamining/main/data/registrar/_list.json";
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Only generate hits for popular TLDs — Cloudflare supports 300+ but most are niche. */
const POPULAR_TLDS = new Set([
  "com", "net", "org", "io", "co", "dev", "app", "ai", "xyz", "me",
  "info", "biz", "us", "tv", "online", "site", "tech", "store", "club",
  "world", "live", "shop", "blog", "pro", "vip", "cloud", "art",
]);

type CloudflarePricingData = Record<string, { price: number; renewal: number }>;

interface TldPrice {
  registration: number;
  renewal: number;
}

let cache: Map<string, TldPrice> | null = null;
let cacheTimestamp = 0;
let inflightPromise: Promise<Map<string, TldPrice> | null> | null = null;

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

async function fetchFromApi(): Promise<Map<string, TldPrice> | null> {
  if (isCacheValid()) return cache;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const res = await fetch(PRICING_URL, {
        headers: { Accept: "application/json", "User-Agent": "donadomains/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) return null;

      const data: CloudflarePricingData = await res.json();
      const map = new Map<string, TldPrice>();

      for (const [tld, info] of Object.entries(data)) {
        if (typeof info?.price === "number" && info.price > 0) {
          map.set(tld.toLowerCase(), {
            registration: info.price,
            renewal: info.renewal ?? info.price,
          });
        }
      }

      cache = map;
      cacheTimestamp = Date.now();
      return map;
    } catch {
      return null;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

/**
 * Fetch Cloudflare's at-cost TLD pricing and generate a hit for each TLD.
 * Availability is unknown — all hits marked available: true for downstream
 * DNS verification.
 */
async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const start = Date.now();
  const pricing = await fetchFromApi();
  const elapsed = Date.now() - start;

  if (!pricing || pricing.size === 0) {
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: "API unavailable" };
  }

  const keyword = query.replace(/\..+$/, "").toLowerCase().trim();
  if (!keyword) {
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed };
  }

  const hits: RegistrarSearchHit[] = [];

  for (const [tld, price] of pricing) {
    if (!POPULAR_TLDS.has(tld)) continue;

    const domain = `${keyword}.${tld}`;
    hits.push({
      domain,
      available: true,
      registration: price.registration,
      renewal: price.renewal,
      currency: "USD",
      buyUrl: buildBuyUrl(domain),
    });
  }

  return { registrar: NAME, hits, fetchTimeMs: elapsed };
}

function buildBuyUrl(domain: string): string {
  return `https://dash.cloudflare.com/?to=/:account/domains/register/${encodeURIComponent(domain)}`;
}

const cloudflare: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default cloudflare;
