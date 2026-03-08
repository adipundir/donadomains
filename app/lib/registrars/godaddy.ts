import type {
  RegistrarPriceResult,
  RegistrarFetchResult,
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";
import { parseSearchMarkdown, logSearchHits, logRawMarkdown } from "./parse-utils";

const NAME = "GoDaddy";

const SEARCH_URL = (q: string) =>
  `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(q)}`;

/** Prices scraped from GoDaddy search pages via Firecrawl. */
let scrapedPrices: Map<string, RegistrarPriceResult> | null = null;


async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const start = Date.now();
  const url = SEARCH_URL(query);
  console.log(`[${NAME}] Searching: ${url}`);

  try {
    const result = await firecrawlScrape(url, 8000);
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

    return { registrar: NAME, hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`[${NAME}] ✗ Error (${elapsed}ms): ${(err as Error).message}`);
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: (err as Error).message };
  }
}

function getPrice(tld: string): RegistrarPriceResult | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return scrapedPrices?.get(key) ?? null;
}

function buildBuyUrl(domain: string): string {
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(domain)}`;
}

async function fetchPricing(): Promise<RegistrarFetchResult> {
  const count = scrapedPrices?.size ?? 0;
  return { registrar: NAME, source: count > 0 ? "scraped" : "api", tldCount: count, fetchTimeMs: 0 };
}

const godaddy: RegistrarModule = { name: NAME, fetchPricing, getPrice, buildBuyUrl, searchDomains };
export default godaddy;
