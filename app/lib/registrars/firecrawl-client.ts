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
      timeout: 20000,
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
