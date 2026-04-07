/**
 * Centralized Firecrawl client for scraping registrar websites.
 *
 * Firecrawl handles Cloudflare, Akamai, and other bot protection automatically.
 * It renders JS, solves challenges, and returns clean HTML/markdown.
 *
 * Each registrar uses its own dedicated Firecrawl API key so all 7 scrapes
 * run against separate rate-limit buckets in parallel with zero contention.
 */
import { FirecrawlClient } from "@mendable/firecrawl-js";

const clientCache = new Map<string, FirecrawlClient>();

export function getFirecrawlClient(apiKey: string): FirecrawlClient {
  if (!apiKey) {
    throw new Error(
      "Firecrawl API key is missing. Each registrar needs its own key — check your .env"
    );
  }
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new FirecrawlClient({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  markdown?: string;
  html?: string;
  error?: string;
  /** Number of non-empty lines in the markdown — useful for judging quality */
  lineCount?: number;
  /** HTTP status code reported by Firecrawl metadata, if available */
  statusCode?: number;
}

/** Minimum non-empty lines for a scrape to be considered "useful".
 *  A page that renders only a nav/footer/error yields <10 lines. */
const MIN_USEFUL_LINES = 5;

/** Errors that indicate a transient issue worth retrying. */
const RETRYABLE_PATTERNS = [
  /timeout/i,
  /rate.?limit/i,
  /429/,
  /502|503|504/,
  /ECONNRESET/i,
  /socket hang up/i,
  /network/i,
];

function isRetryable(error: string): boolean {
  return RETRYABLE_PATTERNS.some((p) => p.test(error));
}

/**
 * Scrape a URL via Firecrawl, returning markdown for parsing.
 * Uses `waitFor` to let JS-heavy search pages render results.
 *
 * Retry strategy:
 *   - Retries up to 2x on retryable errors (timeout, rate limit, 5xx)
 *   - Retries once if the page rendered but returned too few lines (JS didn't finish)
 *   - Backs off 1.5s → 3s between retries
 */
export async function firecrawlScrape(
  url: string,
  waitMs: number,
  apiKey: string,
): Promise<FirecrawlScrapeResult> {
  const MAX_RETRIES = 2;
  const BACKOFF = [1500, 3000];

  let lastError = "";
  let bestResult: FirecrawlScrapeResult | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
      console.log(`[Firecrawl] Retry #${attempt} for ${url} after ${delay}ms (${lastError.slice(0, 60)})`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const fc = getFirecrawlClient(apiKey);
      const doc = await fc.scrape(url, {
        formats: ["markdown"],
        waitFor: waitMs,
        timeout: 30000,
      });

      const markdown = doc.markdown ?? "";
      const lineCount = markdown.split("\n").filter((l) => l.trim()).length;
      const statusCode = doc.metadata?.statusCode;

      const result: FirecrawlScrapeResult = {
        success: true,
        markdown,
        html: doc.html,
        lineCount,
        statusCode,
      };

      // If we got markdown but it's suspiciously short, the page might not
      // have fully rendered. Keep it as our best result but retry once.
      if (lineCount < MIN_USEFUL_LINES) {
        if (!bestResult || (bestResult.lineCount ?? 0) < lineCount) {
          bestResult = result;
        }
        lastError = `only ${lineCount} lines (page may not have rendered)`;
        continue;
      }

      return result;
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      lastError = message;

      // Only retry on transient errors
      if (!isRetryable(message)) {
        return { success: false, error: message };
      }
    }
  }

  // Return the best result we got (even if sparse), or an error
  if (bestResult) return bestResult;
  return { success: false, error: lastError };
}
