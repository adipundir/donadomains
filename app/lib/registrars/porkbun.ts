import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "Porkbun";

const SEARCH_URL = (q: string) =>
  `https://porkbun.com/checkout/search?q=${encodeURIComponent(q)}`;

/** Matches a full domain on its own line (aftermarket/AI suggestions) */
const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})$/i;

/**
 * Matches Porkbun's TLD-label format: **.COM**, **.NINJA**, **.ORG**
 * These represent `{query}.{tld}` in the search results.
 */
const TLD_LABEL_RE = /^\*\*\.([A-Z]{2,})\*\*$/;

const PRICE_RE = /\$([\d,]+(?:\.\d{1,2})?)/g;
const STRIKETHROUGH_PRICE_RE = /~~\$([\d,]+(?:\.\d{1,2})?)~~/g;
const RENEWAL_RE = /renews?\s+at\s+\$([\d,]+(?:\.\d{1,2})?)/i;
const TAKEN_RE = /\bunavailable\b|\bInquire\b/i;
const AFTERMARKET_RE = /\bAftermarket\b/i;
const PREMIUM_RENEWAL_RE = /\bpremium\b/i;
const TRANSFER_FEE_RE = /\+\s*transfer fee/i;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com",
]);

/**
 * Parse Porkbun search markdown.
 *
 * Porkbun has TWO result formats in the same page:
 *
 * 1. TLD labels (primary results) — the keyword + TLD:
 *      **.NINJA**
 *      1st Year Sale!
 *      At Cost
 *      ~~$25.23~~ $5.66 / yearrenews at $25.23
 *      [Checkout.]
 *
 *      **.COM**
 *      Inquire                    ← taken
 *
 * 2. Full domain names (aftermarket / AI suggestions):
 *      startupawesome.com
 *      Aftermarket $1,683
 *      + transfer fee
 *
 * Taken signals: "unavailable", "Inquire" after domain
 * Premium signals: "Aftermarket" + price, "premium" in renewal, "+ transfer fee"
 */
export function parsePorkbunMarkdown(
  markdown: string,
  query: string,
  buildBuyUrl: (domain: string) => string,
): RegistrarSearchHit[] {
  const hits: RegistrarSearchHit[] = [];
  const lines = markdown.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    let domain: string | null = null;

    // Format 1: TLD label like **.NINJA** → construct {query}.ninja
    const tldMatch = trimmed.match(TLD_LABEL_RE);
    if (tldMatch) {
      domain = `${query}.${tldMatch[1].toLowerCase()}`;
    }

    // Format 2: Full domain on its own line
    if (!domain) {
      const domainMatch = trimmed.match(DOMAIN_RE);
      if (domainMatch) {
        domain = domainMatch[1].toLowerCase();
      }
    }

    if (!domain) continue;
    if (INFRA_DOMAINS.has(domain) || seen.has(domain)) continue;
    seen.add(domain);

    let isTaken = false;
    let isPremium = false;
    let registration: number | undefined;
    let renewal: number | undefined;

    for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop at next domain or TLD label
      if (DOMAIN_RE.test(fwd) || TLD_LABEL_RE.test(fwd)) break;
      // Stop at separator (---) or section headers
      if (/^-{3,}$/.test(fwd)) break;
      if (/^sort by|^Aftermarket$/i.test(fwd)) break;
      if (/^show more/i.test(fwd)) break;

      // Skip noise: checkout links, promo labels, images
      if (/^\[Checkout/i.test(fwd)) continue;
      if (/^1st Year Sale|^At Cost$/i.test(fwd)) continue;

      if (TAKEN_RE.test(fwd)) { isTaken = true; }
      if (AFTERMARKET_RE.test(fwd) || TRANSFER_FEE_RE.test(fwd)) isPremium = true;

      // Check renewal line
      const renewalMatch = fwd.match(RENEWAL_RE);
      if (renewalMatch) {
        renewal = parseFloat(renewalMatch[1].replace(/,/g, ""));
        if (PREMIUM_RENEWAL_RE.test(fwd)) isPremium = true;
      }

      // Extract price: remove strikethrough prices (original), then take remaining
      if (fwd.includes("$") && registration == null) {
        // Handle aftermarket price
        if (AFTERMARKET_RE.test(fwd)) {
          PRICE_RE.lastIndex = 0;
          const m = PRICE_RE.exec(fwd);
          if (m) {
            registration = parseFloat(m[1].replace(/,/g, ""));
            isPremium = true;
          }
          continue;
        }

        // Remove strikethrough prices (original price crossed out)
        const withoutStrike = fwd.replace(STRIKETHROUGH_PRICE_RE, "");

        const prices: number[] = [];
        let m: RegExpExecArray | null;
        PRICE_RE.lastIndex = 0;
        while ((m = PRICE_RE.exec(withoutStrike)) !== null) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) prices.push(val);
        }
        if (prices.length > 0) {
          // Take the lowest remaining price (the sale/actual price)
          registration = Math.min(...prices);
        }
      }
    }

    // High price without explicit premium label → premium/aftermarket
    if (!isPremium && registration != null && registration >= 500) {
      isPremium = true;
    }

    const available = !isTaken && !isPremium && registration != null;

    hits.push({
      domain,
      available,
      explicitlyTaken: isTaken || undefined,
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

  console.log(`[${NAME}] Scraping: ${url} (waitFor=8000ms)`);

  try {
    const result = await firecrawlScrape(url, 8000, process.env.FIRECRAWL_API_KEY_PORKBUN ?? "");
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

    const hits = parsePorkbunMarkdown(result.markdown, query, buildBuyUrl);

    const available = hits.filter(h => h.available && !h.premium);
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
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

const porkbun: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default porkbun;
