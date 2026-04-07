import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "Hover";

const SEARCH_URL = (q: string) =>
  `https://www.hover.com/domains/results?q=${encodeURIComponent(q)}`;

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})$/i;
const PRICE_RE = /\$([\d,]+(?:\.\d{1,2})?)/g;
const SALE_PRICE_RE = /SALE\s*\$([\d,]+(?:\.\d{1,2})?)/i;
const TIERED_RENEWAL_RE = /annual renewal is \$([\d,]+(?:\.\d{1,2})?)/i;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com",
]);

/** Max available results to keep (Hover returns 400-500 niche TLDs). */
const MAX_AVAILABLE = 50;

/**
 * Parse Hover search markdown.
 *
 * Format (cleanest of all registrars):
 *   techstartup.online       <- domain on its own line
 *   Stay connected with .ONLINE   <- optional tagline (ignore)
 *   SALE$2.99 / $36.99       <- SALE$promo / $regular  OR just  $regular
 *
 * NO taken domains shown (Hover only returns available).
 * Tiered: "This is a tiered price domain. Annual renewal is $X."
 */
export function parseHoverMarkdown(
  markdown: string,
  buildBuyUrl: (domain: string) => string,
): RegistrarSearchHit[] {
  const hits: RegistrarSearchHit[] = [];
  const lines = markdown.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const domainMatch = trimmed.match(DOMAIN_RE);
    if (!domainMatch) continue;

    const domain = domainMatch[1].toLowerCase();
    if (INFRA_DOMAINS.has(domain) || seen.has(domain)) continue;
    seen.add(domain);

    let registration: number | undefined;
    let renewal: number | undefined;

    // Forward context: look for price lines, stop at next domain
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop if next domain
      if (DOMAIN_RE.test(fwd)) break;

      // Check for tiered renewal
      const tieredMatch = fwd.match(TIERED_RENEWAL_RE);
      if (tieredMatch) {
        renewal = parseFloat(tieredMatch[1].replace(/,/, ""));
      }

      // Extract price
      if (fwd.includes("$") && registration == null) {
        // SALE$2.99 / $36.99 — sale price comes first after SALE
        const saleMatch = fwd.match(SALE_PRICE_RE);
        if (saleMatch) {
          registration = parseFloat(saleMatch[1].replace(/,/, ""));
          // The second price after "/" is the regular/renewal price
          const afterSale = fwd.slice(fwd.indexOf("/") + 1);
          const regMatch = afterSale.match(/\$([\d,]+(?:\.\d{1,2})?)/);
          if (regMatch && renewal == null) {
            renewal = parseFloat(regMatch[1].replace(/,/, ""));
          }
        } else {
          // Plain price: $36.99 or $36.99 / year
          const prices: number[] = [];
          let m: RegExpExecArray | null;
          PRICE_RE.lastIndex = 0;
          while ((m = PRICE_RE.exec(fwd)) !== null) {
            const val = parseFloat(m[1].replace(/,/, ""));
            if (!isNaN(val) && val > 0) prices.push(val);
          }
          if (prices.length > 0) {
            registration = prices[0];
          }
        }
      }
    }

    // Flag very high-priced domains as premium
    const isPremium = registration != null && registration >= 500;

    // Hover only shows available domains
    const available = !isPremium && registration != null;

    hits.push({
      domain,
      available,
      premium: isPremium || undefined,
      registration,
      renewal,
      currency: "USD",
      buyUrl: buildBuyUrl(domain),
    });
  }

  return hits;
}

const DEBUG_SCRAPE = process.env.DEBUG_SCRAPE === "1";

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const start = Date.now();

  console.log(`[${NAME}] Scraping: ${url} (waitFor=3000ms)`);

  try {
    const result = await firecrawlScrape(url, 3000, process.env.FIRECRAWL_API_KEY_HOVER ?? "");
    const elapsed = Date.now() - start;

    if (!result.success || !result.markdown) {
      console.log(`[${NAME}] FAILED in ${elapsed}ms — ${result.error ?? "no markdown"}`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: result.error };
    }

    const lineCount = result.markdown.split("\n").filter(l => l.trim()).length;
    console.log(`[${NAME}] Got ${lineCount} non-empty lines in ${elapsed}ms`);

    if (DEBUG_SCRAPE) {
      const preview = result.markdown.split("\n").filter(l => l.trim()).slice(0, 40);
      for (const line of preview) console.log(`[${NAME}]   | ${line.slice(0, 120)}`);
    }

    let hits = parseHoverMarkdown(result.markdown, buildBuyUrl);

    // Cap available results — Hover returns 400-500 niche TLDs
    const availableHits = hits.filter(h => h.available);
    if (availableHits.length > MAX_AVAILABLE) {
      const cappedAvailable = new Set(availableHits.slice(0, MAX_AVAILABLE).map(h => h.domain));
      hits = hits.filter(h => !h.available || cappedAvailable.has(h.domain));
    }

    const available = hits.filter(h => h.available);
    const taken = hits.filter(h => !h.available && !h.premium);
    const premium = hits.filter(h => h.premium);
    console.log(`[${NAME}] Parsed: ${hits.length} total — ${available.length} available, ${taken.length} taken, ${premium.length} premium`);

    if (available.length > 0) {
      const sample = available.slice(0, 3).map(h => `${h.domain} ($${h.registration ?? "?"})`).join(", ");
      console.log(`[${NAME}] Sample available: ${sample}`);
    }

    return { registrar: NAME, hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`[${NAME}] EXCEPTION in ${elapsed}ms — ${(err as Error).message}`);
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: (err as Error).message };
  }
}

function buildBuyUrl(domain: string): string {
  return `https://www.hover.com/domains/results?q=${encodeURIComponent(domain)}`;
}

const hover: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default hover;
