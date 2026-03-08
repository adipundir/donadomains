import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";
import { parseSearchMarkdown, logSearchHits, logRawMarkdown } from "./parse-utils";

const NAME = "Porkbun";
const API_URL = "https://api.porkbun.com/api/json/v3/pricing/get";
const API_TIMEOUT_MS = 45_000;

type PorkbunApiResponse = {
  status?: string;
  pricing?: Record<string, { registration?: string; renewal?: string }>;
};

const SEARCH_URL = (q: string) =>
  `https://porkbun.com/checkout/search?q=${encodeURIComponent(q)}`;

let apiCache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (apiCache) return apiCache;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    const start = Date.now();
    console.log(`[${NAME}] Fetching live pricing from API...`);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      const elapsed = Date.now() - start;
      console.log(`[${NAME}] ← HTTP ${res.status} (${elapsed}ms)`);

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

      const samples = ["com", "net", "org", "xyz", "io"].map(t => {
        const p = map.get(t);
        return p ? `.${t}=$${p.registration}` : null;
      }).filter(Boolean).join(", ");
      console.log(`[${NAME}] ✓ API: ${map.size} TLDs in ${elapsed}ms — ${samples}`);

      apiCache = map;
      return map;
    } catch (err) {
      console.log(`[${NAME}] ✗ API ERROR: ${(err as Error).message}`);
      return null;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}


async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const start = Date.now();
  const url = SEARCH_URL(query);
  console.log(`[${NAME}] Searching: ${url}`);

  try {
    const result = await firecrawlScrape(url, 6000);
    const elapsed = Date.now() - start;

    if (!result.success || !result.markdown) {
      console.log(`[${NAME}] ✗ Scrape failed (${elapsed}ms): ${result.error}`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: result.error };
    }

    console.log(`[${NAME}] ← Scraped ${result.markdown.length} chars (${elapsed}ms)`);
    logRawMarkdown(NAME, result.markdown);
    const hits = parseSearchMarkdown(result.markdown, buildBuyUrl);
    console.log(`[${NAME}] ✓ Found ${hits.length} domains (${hits.filter(h => h.available).length} available)`);
    logSearchHits(NAME, hits);

    return { registrar: NAME, hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`[${NAME}] ✗ Error (${elapsed}ms): ${(err as Error).message}`);
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: (err as Error).message };
  }
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

  console.log(`[${NAME}] ✗ API failed — no pricing available`);
  return { registrar: NAME, source: "api", tldCount: 0, fetchTimeMs: elapsed, error: "API failed" };
}

const porkbun: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default porkbun;
