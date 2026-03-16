import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";

const NAME = "Porkbun";
const API_URL = "https://api.porkbun.com/api/json/v3/pricing/get";
const API_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Only generate hits for popular TLDs — leave niche discovery to Firecrawl registrars. */
const POPULAR_TLDS = new Set([
  "com", "net", "org", "io", "co", "dev", "app", "ai", "xyz", "me",
  "info", "biz", "us", "tv", "online", "site", "tech", "store", "club",
  "world", "live", "shop", "blog", "pro", "vip", "cloud", "art",
]);

type PorkbunApiResponse = {
  status?: string;
  pricing?: Record<string, { registration?: string; renewal?: string }>;
};

interface TldPrice {
  registration: number;
  renewal: number;
}

let apiCache: Map<string, TldPrice> | null = null;
let cacheTimestamp = 0;
let inflightPromise: Promise<Map<string, TldPrice> | null> | null = null;

function isCacheValid(): boolean {
  return apiCache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

async function fetchFromApi(): Promise<Map<string, TldPrice> | null> {
  if (isCacheValid()) return apiCache;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      if (!res.ok) return null;

      const data: PorkbunApiResponse = await res.json();
      if (data.status !== "SUCCESS" || !data.pricing) return null;

      const map = new Map<string, TldPrice>();

      for (const [tld, info] of Object.entries(data.pricing)) {
        const reg = parseFloat(String(info?.registration ?? "").replace(/,/g, ""));
        const renew = parseFloat(String(info?.renewal ?? "").replace(/,/g, ""));
        if (!isNaN(reg) && reg > 0) {
          map.set(tld.toLowerCase(), {
            registration: reg,
            renewal: isNaN(renew) ? reg : renew,
          });
        }
      }

      apiCache = map;
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
 * Fetch all TLD pricing from Porkbun's API and generate a hit for each TLD.
 * Since we can't check availability via this endpoint, all hits are marked
 * available: true — DNS verification happens downstream.
 */
async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const start = Date.now();
  const pricing = await fetchFromApi();
  const elapsed = Date.now() - start;

  if (!pricing || pricing.size === 0) {
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: "API unavailable" };
  }

  // Strip any TLD the user may have typed to get the bare keyword
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
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

const porkbun: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default porkbun;
