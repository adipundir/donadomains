import type { RegistrarPriceResult, RegistrarFetchResult, RegistrarModule } from "./types";

const NAME = "Cloudflare";

/**
 * Cloudflare Registrar sells domains at wholesale (ICANN) cost with no markup.
 * They have no public pricing API — dashboard only.
 *
 * These prices come from Cloudflare's own TLD pricing page (manually verified).
 * Since they sell at cost, prices only change when ICANN/registry fees change (rare).
 * Last verified: March 2026.
 *
 * NOTE: Registration and renewal prices are the SAME at Cloudflare (at-cost model).
 */
const PRICES: Record<string, number> = {
  com: 10.11,
  net: 10.26,
  org: 10.11,
  io: 39.74,
  co: 12.59,
  dev: 12.85,
  app: 15.85,
  ai: 25.85,
  xyz: 10.36,
  me: 7.49,
  info: 10.11,
  biz: 10.11,
  us: 7.49,
  tv: 31.49,
  online: 3.98,
  site: 3.98,
  tech: 5.98,
  store: 3.98,
  club: 5.98,
  world: 7.98,
  sh: 40.00,
  uk: 7.49,
  de: 6.49,
  ca: 11.50,
  au: 12.49,
  in: 8.49,
  jp: 12.49,
  fr: 7.49,
  nl: 6.49,
  se: 14.99,
};

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  const price = PRICES[key];
  if (price == null) return null;
  return {
    registrar: NAME,
    tld: key,
    registration: price,
    renewal: price,
    currency: "USD",
    source: "static",
    fetchedAt: 0,
  };
}

function buildBuyUrl(domain: string): string {
  return `https://dash.cloudflare.com/?to=/:account/domains/register/${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  console.log(`[${NAME}] Using at-cost pricing table (${Object.keys(PRICES).length} TLDs). No public API available.`);
  console.log(`[${NAME}]   Samples: .com=$${PRICES.com}, .net=$${PRICES.net}, .org=$${PRICES.org}, .xyz=$${PRICES.xyz}, .io=$${PRICES.io}`);
  return {
    registrar: NAME,
    source: "static",
    tldCount: Object.keys(PRICES).length,
    fetchTimeMs: 0,
  };
}

const cloudflare: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl };
export default cloudflare;
