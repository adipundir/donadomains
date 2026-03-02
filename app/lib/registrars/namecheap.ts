import type { RegistrarPriceResult, RegistrarFetchResult, RegistrarModule } from "./types";

const NAME = "Namecheap";
const TIMEOUT_MS = 10_000;

let cache: Map<string, RegistrarPriceResult> | null = null;
let inflightPromise: Promise<Map<string, RegistrarPriceResult> | null> | null = null;

function getCredentials() {
  const user = process.env.NAMECHEAP_API_USER;
  const key = process.env.NAMECHEAP_API_KEY;
  const ip = process.env.NAMECHEAP_API_IP;
  return user && key && ip ? { user, key, ip } : null;
}

/**
 * Namecheap API: `namecheap.users.getPricing` returns ALL TLD pricing in one call.
 * Requires API credentials + whitelisted IP.
 * Docs: https://www.namecheap.com/support/api/methods/users/get-pricing/
 */
async function fetchFromApi(): Promise<Map<string, RegistrarPriceResult> | null> {
  if (cache) {
    console.log(`[${NAME}] Using cached API data (${cache.size} TLDs)`);
    return cache;
  }
  if (inflightPromise) return inflightPromise;

  const creds = getCredentials();
  if (!creds) {
    console.log(`[${NAME}] No API credentials (NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_API_IP). Using static pricing.`);
    return null;
  }

  inflightPromise = (async () => {
    const start = Date.now();
    const params = new URLSearchParams({
      ApiUser: creds.user,
      ApiKey: creds.key,
      UserName: creds.user,
      ClientIP: creds.ip,
      Command: "namecheap.users.getPricing",
      ProductType: "DOMAIN",
      ActionName: "REGISTER",
    });

    const url = `https://api.namecheap.com/xml.response?${params}`;
    console.log(`[${NAME}] Fetching live pricing from API...`);
    console.log(`[${NAME}] → GET https://api.namecheap.com/xml.response?Command=namecheap.users.getPricing&...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const elapsed = Date.now() - start;
      console.log(`[${NAME}] ← HTTP ${res.status} (${elapsed}ms)`);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.log(`[${NAME}] ✗ API failed: HTTP ${res.status}`);
        console.log(`[${NAME}]   Response: ${body.slice(0, 300)}`);
        return null;
      }

      const xml = await res.text();
      console.log(`[${NAME}] ← Response XML length: ${xml.length} chars`);

      const isError = xml.includes('Status="ERROR"');
      if (isError) {
        const errorMatch = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
        console.log(`[${NAME}] ✗ API error: ${errorMatch?.[1] ?? "unknown"}`);
        return null;
      }

      const map = new Map<string, RegistrarPriceResult>();
      const now = Date.now();

      const productBlocks = xml.split(/<ProductType\s+Name="domains"/i);
      const domainBlock = productBlocks.length > 1 ? productBlocks[1].split(/<\/ProductType>/)[0] : xml;

      const categoryBlocks = domainBlock.split(/<ProductCategory\s+Name="([^"]+)"/gi);
      for (let i = 1; i < categoryBlocks.length; i += 2) {
        const block = categoryBlocks[i + 1] || "";
        const products = block.split(/<Product\s+Name="/gi);
        for (let j = 1; j < products.length; j++) {
          const nameEnd = products[j].indexOf('"');
          if (nameEnd === -1) continue;
          const tld = products[j].slice(0, nameEnd).toLowerCase();

          const priceMatch = products[j].match(/Duration="1"[^>]*YourPrice="([^"]+)"/);
          const addiPriceMatch = products[j].match(/Duration="1"[^>]*YourAddiPrice="([^"]+)"/);

          const regPrice = parseFloat((priceMatch?.[1] ?? "").replace(/,/g, ""));
          const renewPrice = parseFloat((addiPriceMatch?.[1] ?? "").replace(/,/g, ""));

          if (!isNaN(regPrice) && regPrice > 0) {
            map.set(tld, {
              registrar: NAME,
              tld,
              registration: regPrice,
              renewal: isNaN(renewPrice) || renewPrice <= 0 ? regPrice : renewPrice,
              currency: "USD",
              source: "api",
              fetchedAt: now,
            });
          }
        }
      }

      const sampleStr = ["com", "net", "org", "xyz", "io"]
        .map((t) => {
          const p = map.get(t);
          return p ? `.${t}=$${p.registration.toFixed(2)} (renew=$${p.renewal.toFixed(2)})` : null;
        })
        .filter(Boolean).join(", ");

      console.log(`[${NAME}] ✓ API SUCCESS: ${map.size} TLDs in ${elapsed}ms`);
      console.log(`[${NAME}]   Samples: ${sampleStr}`);

      if (map.size > 0) {
        cache = map;
        return map;
      }

      console.log(`[${NAME}] ✗ Parsed 0 TLDs from API response`);
      return null;
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

const STATIC_PRICES: Record<string, { registration: number; renewal: number }> = {
  com: { registration: 9.58, renewal: 15.58 },
  net: { registration: 12.98, renewal: 16.98 },
  org: { registration: 9.48, renewal: 16.98 },
  io: { registration: 25.88, renewal: 39.88 },
  co: { registration: 11.98, renewal: 32.98 },
  dev: { registration: 12.98, renewal: 16.98 },
  app: { registration: 14.98, renewal: 20.98 },
  ai: { registration: 69.98, renewal: 69.98 },
  xyz: { registration: 1.98, renewal: 13.98 },
  me: { registration: 5.98, renewal: 19.98 },
  info: { registration: 4.98, renewal: 18.98 },
  biz: { registration: 12.98, renewal: 18.98 },
  us: { registration: 5.98, renewal: 9.98 },
  tv: { registration: 37.98, renewal: 37.98 },
  online: { registration: 2.98, renewal: 34.98 },
  site: { registration: 2.98, renewal: 34.98 },
  tech: { registration: 4.98, renewal: 49.98 },
  store: { registration: 2.98, renewal: 43.98 },
  club: { registration: 4.98, renewal: 14.98 },
  world: { registration: 5.98, renewal: 31.98 },
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
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
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

const namecheap: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl };
export default namecheap;
