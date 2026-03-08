import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Squarespace";

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = `https://domains.squarespace.com/#/${encodeURIComponent(query)}`;
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 10000);

  const now = Date.now();
  if (!scrapedPrices) scrapedPrices = new Map();
  for (const hit of hits) {
    if (hit.registration != null && !hit.premium) {
      const tld = hit.domain.split(".").slice(1).join(".");
      if (!scrapedPrices.has(tld)) {
        scrapedPrices.set(tld, {
          registrar: NAME, tld, registration: hit.registration,
          renewal: hit.renewal ?? hit.registration,
          currency: "USD", source: "scraped", fetchedAt: now,
        });
      }
    }
  }

  return { registrar: NAME, hits, fetchTimeMs, error };
}

let scrapedPrices: Map<string, RegistrarPriceResult> | null = null;

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return scrapedPrices?.get(key) ?? null;
}

function buildBuyUrl(domain: string): string {
  return `https://domains.squarespace.com/#/${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const count = scrapedPrices?.size ?? 0;
  return { registrar: NAME, source: count > 0 ? "scraped" : "api", tldCount: count, fetchTimeMs: 0 };
}

const squarespace: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default squarespace;
