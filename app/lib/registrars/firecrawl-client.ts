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
 * More expensive (5 credits) but far more reliable for complex pages.
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
      formats: ["json", "markdown"],
      waitFor: waitMs,
      timeout: 30000,
      jsonOptions: { schema, prompt },
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
