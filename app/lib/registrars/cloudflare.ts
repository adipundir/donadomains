import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";

const NAME = "Cloudflare";
const PRICING_URL = "https://raw.githubusercontent.com/Cloudflare-Mining/Cloudflare-Datamining/main/data/registrar/_list.json";
const TIMEOUT_MS = 15_000;

type CloudflarePricingData = Record<string, { price: number; renewal: number }>;

let cache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (cache) return cache;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    const start = Date.now();
    console.log(`[${NAME}] Fetching pricing from Cloudflare-Datamining...`);

    try {
      const res = await fetch(PRICING_URL, {
        headers: { Accept: "application/json", "User-Agent": "donadomains/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const elapsed = Date.now() - start;
      if (!res.ok) {
        console.log(`[${NAME}] ✗ HTTP ${res.status} (${elapsed}ms)`);
        return null;
      }

      const data: CloudflarePricingData = await res.json();
      const map = new Map<string, RegistrarPriceResult>();
      const now = Date.now();

      for (const [tld, info] of Object.entries(data)) {
        if (typeof info?.price === "number" && info.price > 0) {
          map.set(tld.toLowerCase(), {
            registrar: NAME, tld: tld.toLowerCase(),
            registration: info.price, renewal: info.renewal ?? info.price,
            currency: "USD", source: "api", fetchedAt: now,
          });
        }
      }

      const samples = ["com", "net", "org", "io", "xyz"].map(t => {
        const p = map.get(t);
        return p ? `.${t}=$${p.registration}` : null;
      }).filter(Boolean).join(", ");
      console.log(`[${NAME}] ✓ ${map.size} TLDs in ${elapsed}ms — ${samples}`);

      cache = map;
      return map;
    } catch (err) {
      console.log(`[${NAME}] ✗ ERROR: ${(err as Error).message}`);
      return null;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

/**
 * Cloudflare has no public domain search page — only the dashboard.
 * This returns empty hits; Cloudflare contributes only via getPrice()
 * which is merged into buy links by the orchestrator.
 */
async function searchDomains(): Promise<RegistrarSearchResult> {
  return { registrar: NAME, hits: [], fetchTimeMs: 0 };
}

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return cache?.get(key) ?? null;
}

function buildBuyUrl(domain: string): string {
  return `https://dash.cloudflare.com/?to=/:account/domains/register/${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const start = Date.now();
  const result = await fetchFromApi();
  return {
    registrar: NAME,
    source: "api",
    tldCount: result?.size ?? 0,
    fetchTimeMs: Date.now() - start,
    error: result ? undefined : "Failed to fetch Cloudflare pricing",
  };
}

const cloudflare: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default cloudflare;
