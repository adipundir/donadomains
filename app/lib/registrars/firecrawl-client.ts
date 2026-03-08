/**
 * Centralized Firecrawl client for scraping registrar websites.
 *
 * Firecrawl handles Cloudflare, Akamai, and other bot protection automatically.
 * It renders JS, solves challenges, and returns clean HTML/markdown.
 */
import { FirecrawlClient } from "@mendable/firecrawl-js";

const API_KEY = process.env.FIRECRAWL_API_KEY ?? "";

let client: FirecrawlClient | null = null;

export function getFirecrawlClient(): FirecrawlClient {
  if (!API_KEY) {
    throw new Error(
      "FIRECRAWL_API_KEY is required. Get a key at https://firecrawl.dev"
    );
  }
  if (!client) {
    client = new FirecrawlClient({ apiKey: API_KEY });
  }
  return client;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  markdown?: string;
  html?: string;
  json?: unknown;
  error?: string;
}

/**
 * Scrape a URL via Firecrawl, returning markdown for parsing.
 * Uses `waitFor` to let JS-heavy search pages render results.
 */
export async function firecrawlScrape(
  url: string,
  waitMs = 5000
): Promise<FirecrawlScrapeResult> {
  try {
    const fc = getFirecrawlClient();
    const doc = await fc.scrape(url, {
      formats: ["markdown"],
      waitFor: waitMs,
      timeout: 30000,
    });
    return {
      success: true,
      markdown: doc.markdown,
      html: doc.html,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Scrape a URL and extract structured JSON using Firecrawl's LLM extraction.
 * More expensive (uses LLM inference) but far more reliable for complex pages.
 *
 * The `schema` and `prompt` are passed as a JsonFormat entry in the formats
 * array, which is the correct API for SDK v4+.
 */
export async function firecrawlExtract<T>(
  url: string,
  schema: Record<string, unknown>,
  prompt?: string,
  waitMs = 5000
): Promise<{ success: boolean; data?: T; markdown?: string; error?: string }> {
  try {
    const fc = getFirecrawlClient();
    const doc = await fc.scrape(url, {
      formats: [
        "markdown",
        { type: "json" as const, schema, prompt },
      ],
      waitFor: waitMs,
      timeout: 30000,
    });
    return {
      success: true,
      data: doc.json as T | undefined,
      markdown: doc.markdown,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/* ── Domain extraction via LLM ── */

export interface ExtractedDomain {
  domain: string;
  available: boolean;
  registration_price_usd?: number;
  renewal_price_usd?: number;
  is_premium?: boolean;
}

interface DomainExtractionResult {
  results: ExtractedDomain[];
}

const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Full domain name, e.g. example.com" },
          available: { type: "boolean", description: "true if the domain can be registered" },
          registration_price_usd: {
            type: "number",
            description: "Yearly registration price in USD for this specific domain",
          },
          renewal_price_usd: {
            type: "number",
            description: "Yearly renewal price in USD",
          },
          is_premium: {
            type: "boolean",
            description: "true if listed as premium, aftermarket, auction, or make-an-offer",
          },
        },
        required: ["domain", "available"],
      },
    },
  },
  required: ["results"],
};

const EXTRACTION_PROMPT = `Extract every domain search result from this registrar page.

For each domain listed:
- "domain": the full domain name (e.g. "example.com")
- "available": true if it can be registered at a standard price
- "registration_price_usd": the per-domain, per-year registration price in USD.
  CRITICAL: Use ONLY the actual registration price for that specific domain.
  Do NOT use savings amounts ("Save $2.53"), bundle totals ("for only $21.07"),
  crossed-out/original prices, or prices from unrelated domains.
- "renewal_price_usd": the per-year renewal price in USD, if shown
- "is_premium": true if marked as premium, aftermarket, auction, or requires an offer`;

/**
 * Scrape a registrar search page and extract domain results using LLM.
 * Returns structured data + raw markdown (for fallback parsing).
 */
export async function firecrawlExtractDomains(
  url: string,
  waitMs = 6000,
): Promise<{
  success: boolean;
  domains?: ExtractedDomain[];
  markdown?: string;
  error?: string;
}> {
  const result = await firecrawlExtract<DomainExtractionResult>(
    url,
    EXTRACTION_SCHEMA,
    EXTRACTION_PROMPT,
    waitMs,
  );

  if (result.success && result.data?.results && result.data.results.length > 0) {
    return {
      success: true,
      domains: result.data.results,
      markdown: result.markdown,
    };
  }

  return {
    success: false,
    markdown: result.markdown,
    error: result.error || "LLM extraction returned no results",
  };
}
