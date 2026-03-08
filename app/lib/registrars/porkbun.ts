import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
const NAME = "Porkbun";
const API_URL = "https://api.porkbun.com/api/json/v3/pricing/get";
const API_TIMEOUT_MS = 45_000;

type PorkbunApiResponse = {
  status?: string;
  pricing?: Record<string, { registration?: string; renewal?: string }>;
};

let apiCache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (apiCache) return apiCache;
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

      const map = new Map<string, RegistrarPriceResult>();
      const now = Date.now();

      for (const [tld, info] of Object.entries(data.pricing)) {
        const reg = parseFloat(String(info?.registration ?? "").replace(/,/g, ""));
        const renew = parseFloat(String(info?.renewal ?? "").replace(/,/g, ""));
        if (!isNaN(reg) && reg > 0) {
          map.set(tld.toLowerCase(), {
            registrar: NAME, tld: tld.toLowerCase(),
            registration: reg, renewal: isNaN(renew) ? reg : renew,
            currency: "USD", source: "api", fetchedAt: now,
          });
        }
      }

      apiCache = map;
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
 * Porkbun's search page is a heavy SPA that doesn't render results within
 * Firecrawl's waitFor window (returns "Loading..." spinners). Scraping it
 * produces no usable data. Instead, Porkbun contributes via getPrice() which
 * uses the Porkbun bulk pricing API — accurate per-TLD pricing that gets
 * merged in Phase 2 of buildMergedBuyLinks.
 */
async function searchDomains(): Promise<RegistrarSearchResult> {
  return { registrar: NAME, hits: [], fetchTimeMs: 0 };
}

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return apiCache?.get(key) ?? null;
}

function buildBuyUrl(domain: string): string {
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const start = Date.now();

  if (apiCache) {
    return { registrar: NAME, source: "api", tldCount: apiCache.size, fetchTimeMs: 0 };
  }

  const result = await fetchFromApi();
  const elapsed = Date.now() - start;

  if (result) {
    return { registrar: NAME, source: "api", tldCount: result.size, fetchTimeMs: elapsed };
  }

  return { registrar: NAME, source: "api", tldCount: 0, fetchTimeMs: elapsed, error: "API failed" };
}

const porkbun: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default porkbun;
