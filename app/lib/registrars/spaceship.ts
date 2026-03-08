import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Spaceship";

const SEARCH_URL = (q: string) =>
  `https://www.spaceship.com/domains/?search=${encodeURIComponent(q)}`;

/** Prices scraped from Spaceship search pages via Firecrawl. */
let scrapedPrices: Map<string, RegistrarPriceResult> | null = null;


async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);

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

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return scrapedPrices?.get(key) ?? null;
}

function buildBuyUrl(domain: string): string {
  return `https://www.spaceship.com/domains/?search=${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const count = scrapedPrices?.size ?? 0;
  return { registrar: NAME, source: count > 0 ? "scraped" : "api", tldCount: count, fetchTimeMs: 0 };
}

const spaceship: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default spaceship;
