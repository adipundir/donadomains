import type { RegistrarPriceResult, RegistrarFetchResult, RegistrarModule } from "./types";

const NAME = "GoDaddy";
const API_BASE = "https://api.godaddy.com";
const TIMEOUT_MS = 10_000;

let cache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

function getCredentials() {
  const key = process.env.GODADDY_API_KEY;
  const secret = process.env.GODADDY_API_SECRET;
  return key && secret ? { key, secret } : null;
}

/**
 * GoDaddy requires API credentials (sso-key) AND 50+ domains in the account.
 * When creds are available, we fetch per-TLD pricing by checking a dummy domain.
 * The API returns the actual current price for that domain.
 */
async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (cache) {
    console.log(`[${NAME}] Using cached data (${cache.size} TLDs)`);
    return cache;
  }
  if (inflightPromise) return inflightPromise;

  const creds = getCredentials();
  if (!creds) {
    console.log(`[${NAME}] No API credentials (GODADDY_API_KEY, GODADDY_API_SECRET). Using static pricing.`);
    return null;
  }

  inflightPromise = (async () => {
    const start = Date.now();
    console.log(`[${NAME}] Fetching live pricing from API...`);

    const tlds = ["com", "net", "org", "io", "co", "dev", "app", "ai", "xyz", "me", "info", "biz", "us", "tv", "online", "site", "tech", "store", "club", "world"];
    const map = new Map<string, RegistrarPriceResult>();
    const now = Date.now();
    const authHeader = `sso-key ${creds.key}:${creds.secret}`;

    const results = await Promise.allSettled(
      tlds.map(async (tld) => {
        const testDomain = `exampledomain123456.${tld}`;
        const url = `${API_BASE}/v1/domains/available?domain=${testDomain}`;
        console.log(`[${NAME}] → GET ${url}`);

        const res = await fetch(url, {
          headers: { Authorization: authHeader, Accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        const body = await res.text();
        console.log(`[${NAME}] ← .${tld}: HTTP ${res.status} — ${body.slice(0, 200)}`);

        if (!res.ok) return null;

        const data = JSON.parse(body) as { available?: boolean; price?: number; currency?: string; period?: number };
        if (data.price != null && data.price > 0) {
          const priceUsd = data.price / 1_000_000;
          map.set(tld, {
            registrar: NAME,
            tld,
            registration: priceUsd,
            renewal: priceUsd,
            currency: "USD",
            source: "api",
            fetchedAt: now,
          });
          return priceUsd;
        }
        return null;
      })
    );

    const elapsed = Date.now() - start;
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value != null).length;
    console.log(`[${NAME}] API completed in ${elapsed}ms: ${succeeded}/${tlds.length} TLDs priced`);

    if (map.size > 0) {
      cache = map;
      const sampleStr = ["com", "net", "org", "xyz"]
        .map((t) => { const p = map.get(t); return p ? `.${t}=$${p.registration.toFixed(2)}` : null; })
        .filter(Boolean).join(", ");
      console.log(`[${NAME}] ✓ API samples: ${sampleStr}`);
      return map;
    }

    console.log(`[${NAME}] ✗ API returned no pricing data`);
    return null;
  })();

  return inflightPromise;
}

const STATIC_PRICES: Record<string, { registration: number; renewal: number }> = {
  com: { registration: 11.99, renewal: 22.99 },
  net: { registration: 14.99, renewal: 22.99 },
  org: { registration: 9.99, renewal: 22.99 },
  io: { registration: 49.99, renewal: 59.99 },
  co: { registration: 11.99, renewal: 36.99 },
  dev: { registration: 15.99, renewal: 22.99 },
  app: { registration: 19.99, renewal: 24.99 },
  ai: { registration: 79.99, renewal: 79.99 },
  xyz: { registration: 3.99, renewal: 15.99 },
  me: { registration: 9.99, renewal: 19.99 },
  info: { registration: 3.99, renewal: 25.99 },
  biz: { registration: 14.99, renewal: 22.99 },
  us: { registration: 5.99, renewal: 19.99 },
  tv: { registration: 39.99, renewal: 39.99 },
  online: { registration: 2.99, renewal: 44.99 },
  site: { registration: 2.99, renewal: 44.99 },
  tech: { registration: 5.99, renewal: 54.99 },
  store: { registration: 2.99, renewal: 44.99 },
  club: { registration: 3.99, renewal: 15.99 },
  world: { registration: 3.99, renewal: 34.99 },
};

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  const apiEntry = cache?.get(key);
  if (apiEntry) return apiEntry;

  const staticEntry = STATIC_PRICES[key];
  if (!staticEntry) return null;
  return {
    registrar: NAME,
    tld: key,
    registration: staticEntry.registration,
    renewal: staticEntry.renewal,
    currency: "USD",
    source: "static",
    fetchedAt: 0,
  };
}

function buildBuyUrl(domain: string): string {
  return `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const start = Date.now();
  const result = await fetchFromApi();
  const staticCount = Object.keys(STATIC_PRICES).length;
  return {
    registrar: NAME,
    source: result ? "api" : "static",
    tldCount: result?.size ?? staticCount,
    fetchTimeMs: Date.now() - start,
    error: result ? undefined : "No API creds or API failed — using static table",
  };
}

const godaddy: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl };
export default godaddy;
