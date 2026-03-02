import type { RegistrarPriceResult, RegistrarFetchResult, RegistrarModule } from "./types";

const NAME = "Porkbun";
const API_URL = "https://api.porkbun.com/api/json/v3/pricing/get";
const API_HARD_TIMEOUT_MS = 45_000;
const API_SOFT_TIMEOUT_MS = 12_000;

type PorkbunApiResponse = {
  status?: string;
  pricing?: Record<string, { registration?: string; renewal?: string }>;
};

/**
 * Static fallback prices from Porkbun (last synced with their API March 2026).
 * Used when the API is slow or unreachable.
 */
const STATIC_PRICES: Record<string, { registration: number; renewal: number }> = {
  com: { registration: 11.08, renewal: 11.08 },
  net: { registration: 9.99, renewal: 12.52 },
  org: { registration: 6.88, renewal: 10.74 },
  xyz: { registration: 2.04, renewal: 12.98 },
  io: { registration: 28.12, renewal: 51.80 },
  co: { registration: 9.58, renewal: 25.97 },
  dev: { registration: 10.81, renewal: 12.87 },
  app: { registration: 10.81, renewal: 14.93 },
  ai: { registration: 72.40, renewal: 72.40 },
  me: { registration: 3.94, renewal: 17.27 },
  info: { registration: 3.09, renewal: 22.14 },
  biz: { registration: 1.54, renewal: 16.99 },
  us: { registration: 4.43, renewal: 7.00 },
  tv: { registration: 26.26, renewal: 26.26 },
  online: { registration: 1.96, renewal: 28.84 },
  site: { registration: 1.96, renewal: 28.84 },
  tech: { registration: 8.75, renewal: 50.98 },
  store: { registration: 2.57, renewal: 43.77 },
  club: { registration: 4.12, renewal: 13.90 },
  world: { registration: 3.60, renewal: 33.47 },
};

let apiCache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (apiCache) {
    console.log(`[${NAME}] Using cached API data (${apiCache.size} TLDs)`);
    return apiCache;
  }
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    const start = Date.now();
    console.log(`[${NAME}] Fetching live pricing from API...`);
    console.log(`[${NAME}] → POST ${API_URL}`);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(API_HARD_TIMEOUT_MS),
      });

      const elapsed = Date.now() - start;
      console.log(`[${NAME}] ← HTTP ${res.status} (${elapsed}ms)`);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.log(`[${NAME}] ✗ API failed: HTTP ${res.status}`);
        console.log(`[${NAME}]   Response body: ${body.slice(0, 300)}`);
        return null;
      }

      const data: PorkbunApiResponse = await res.json();
      console.log(`[${NAME}] ← Response: status="${data.status}", pricing keys=${data.pricing ? Object.keys(data.pricing).length : 0}`);

      if (data.status !== "SUCCESS" || !data.pricing) {
        console.log(`[${NAME}] ✗ Invalid response: status=${data.status}, hasPricing=${!!data.pricing}`);
        return null;
      }

      const map = new Map<string, RegistrarPriceResult>();
      const now = Date.now();

      for (const [tld, info] of Object.entries(data.pricing)) {
        const reg = parseFloat(String(info?.registration ?? "").replace(/,/g, ""));
        const renew = parseFloat(String(info?.renewal ?? "").replace(/,/g, ""));
        if (!isNaN(reg) && reg > 0) {
          map.set(tld.toLowerCase(), {
            registrar: NAME,
            tld: tld.toLowerCase(),
            registration: reg,
            renewal: isNaN(renew) ? reg : renew,
            currency: "USD",
            source: "api",
            fetchedAt: now,
          });
        }
      }

      const samples = ["com", "net", "org", "xyz", "io", "ai", "dev", "me", "biz", "info"];
      const sampleStr = samples
        .map((t) => {
          const p = map.get(t);
          return p ? `.${t}=$${p.registration} (renew=$${p.renewal})` : null;
        })
        .filter(Boolean)
        .join(", ");

      console.log(`[${NAME}] ✓ API SUCCESS: ${map.size} TLDs in ${elapsed}ms`);
      console.log(`[${NAME}]   Samples: ${sampleStr}`);

      apiCache = map;
      return map;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`[${NAME}] ✗ API ERROR after ${elapsed}ms: ${(err as Error).message}`);
      return null;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();

  const apiEntry = apiCache?.get(key);
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
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

/**
 * Races the live API against a soft timeout.
 * If the API responds within SOFT_TIMEOUT, we use live data.
 * If not, we return immediately with static data and let the API
 * continue loading in the background (cached for future requests).
 */
async function fetchPricing(): Promise<RegistrarFetchResult> {
  const start = Date.now();
  const staticCount = Object.keys(STATIC_PRICES).length;

  if (apiCache) {
    console.log(`[${NAME}] Using cached API data (${apiCache.size} TLDs)`);
    return { registrar: NAME, source: "api", tldCount: apiCache.size, fetchTimeMs: 0 };
  }

  const apiPromise = fetchFromApi();

  const softTimer = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), API_SOFT_TIMEOUT_MS)
  );

  const apiResult = await Promise.race([apiPromise, softTimer]);
  const elapsed = Date.now() - start;

  if (apiResult) {
    return { registrar: NAME, source: "api", tldCount: apiResult.size, fetchTimeMs: elapsed };
  }

  // API either timed out or failed — use static fallback.
  // The API promise continues running in background and will cache for next request.
  const timedOut = elapsed >= API_SOFT_TIMEOUT_MS - 100;
  if (timedOut) {
    console.log(`[${NAME}] API still loading after ${API_SOFT_TIMEOUT_MS}ms — using static fallback (${staticCount} TLDs). API will cache for next request.`);
  } else {
    console.log(`[${NAME}] API failed — using static fallback (${staticCount} TLDs)`);
  }

  return {
    registrar: NAME,
    source: "static",
    tldCount: staticCount,
    fetchTimeMs: elapsed,
    error: timedOut
      ? `API slow (>${API_SOFT_TIMEOUT_MS}ms), using static. API continues in background.`
      : "API failed, using static fallback",
  };
}

const porkbun: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl };
export default porkbun;
