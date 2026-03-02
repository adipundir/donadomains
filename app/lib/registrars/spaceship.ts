import type { RegistrarPriceResult, RegistrarFetchResult, RegistrarModule } from "./types";

const NAME = "Spaceship";

/**
 * Spaceship (by Namecheap) — competitive pricing, modern UI.
 * Their API (docs.spaceship.dev) requires API key + secret.
 * No free public pricing endpoint.
 *
 * Prices sourced from spaceship.com/domains/pricing (manually verified).
 * Spaceship generally has lower renewal prices than Namecheap.
 * Last verified: March 2026.
 */
const PRICES: Record<string, { registration: number; renewal: number }> = {
  com: { registration: 9.28, renewal: 12.88 },
  net: { registration: 10.98, renewal: 14.98 },
  org: { registration: 8.98, renewal: 14.98 },
  io: { registration: 24.98, renewal: 37.98 },
  co: { registration: 10.98, renewal: 28.98 },
  dev: { registration: 11.98, renewal: 14.98 },
  app: { registration: 13.98, renewal: 18.98 },
  ai: { registration: 64.98, renewal: 64.98 },
  xyz: { registration: 1.78, renewal: 12.98 },
  me: { registration: 4.98, renewal: 17.98 },
  info: { registration: 3.98, renewal: 16.98 },
  biz: { registration: 10.98, renewal: 16.98 },
  us: { registration: 4.98, renewal: 8.98 },
  tv: { registration: 34.98, renewal: 34.98 },
  online: { registration: 1.98, renewal: 29.98 },
  site: { registration: 1.98, renewal: 29.98 },
  tech: { registration: 3.98, renewal: 44.98 },
  store: { registration: 1.98, renewal: 39.98 },
  club: { registration: 3.98, renewal: 12.98 },
  world: { registration: 4.98, renewal: 28.98 },
};

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  const entry = PRICES[key];
  if (!entry) return null;
  return {
    registrar: NAME,
    tld: key,
    registration: entry.registration,
    renewal: entry.renewal,
    currency: "USD",
    source: "static",
    fetchedAt: 0,
  };
}

function buildBuyUrl(domain: string): string {
  return `https://www.spaceship.com/domains/?search=${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  console.log(`[${NAME}] Using static pricing table (${Object.keys(PRICES).length} TLDs). API requires credentials.`);
  console.log(`[${NAME}]   Samples: .com=$${PRICES.com.registration}, .net=$${PRICES.net.registration}, .xyz=$${PRICES.xyz.registration}`);
  return {
    registrar: NAME,
    source: "static",
    tldCount: Object.keys(PRICES).length,
    fetchTimeMs: 0,
  };
}

const spaceship: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl };
export default spaceship;
