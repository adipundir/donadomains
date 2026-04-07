import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "Namecheap";

const SEARCH_URL = (q: string) =>
  `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(q)}&currencyType=USD`;

const HEADING_DOMAIN_RE = /^##\s+([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})\s*$/i;

/** Namecheap bold price — USD or EUR: **$34.98/yr** or **€84.98** */
const BOLD_USD_PRICE_RE = /\*\*\$([\d,]+(?:\.\d{1,2})?)(?:\/yr)?\*\*/;
const BOLD_EUR_PRICE_RE = /\*\*€([\d,]+(?:\.\d{1,2})?)(?:\/yr)?\*\*/;
const RENEWAL_RE = /[Rr]enews?\s+at\s+\$([\d,]+(?:\.\d{1,2})?)\/yr/i;

/**
 * Namecheap labels premium domains with a "Premium" paragraph, then either
 * "Make offer" or a price. We treat "Make offer" WITHOUT pricing as taken,
 * but "Premium" WITH pricing as a premium/aftermarket domain.
 */
const PREMIUM_RE = /^Premium/i;
const TAKEN_RE = /\bTaken\b/i;
const MAKE_OFFER_RE = /make an? offer/i;
const PREMIUM_PRICE_THRESHOLD = 500;

/** Rough EUR→USD conversion for premium domains. Not exact but good enough
 *  to decide if something is premium vs affordable. */
const EUR_TO_USD = 1.1;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com",
]);

/**
 * Parse Namecheap search markdown.
 *
 * Format (standard domains):
 *   ## coolstartup.io
 *   **$34.98/yr** Retail $65.98/yr
 *   _Renews at $31.98/yr._
 *
 * Format (premium domains):
 *   ## myshop.store
 *   PremiumWe offer high value Premium inventory...
 *   **€1,699.67**
 *   Buy it nowMake offer
 *
 * Format (taken, no pricing):
 *   ## coolstartup.is
 *   TakenThis domain name has already been registered...
 *   Make offer
 */
export function parseNamecheapMarkdown(
  markdown: string,
  buildBuyUrl: (domain: string) => string,
): RegistrarSearchHit[] {
  const hits: RegistrarSearchHit[] = [];
  const lines = markdown.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(HEADING_DOMAIN_RE);
    if (!headingMatch) continue;

    const domain = headingMatch[1].toLowerCase();
    if (INFRA_DOMAINS.has(domain) || seen.has(domain)) continue;
    seen.add(domain);

    let isTaken = false;
    let isPremium = false;
    let registration: number | undefined;
    let renewal: number | undefined;
    let hasMakeOffer = false;

    // Forward context until next heading or 10 raw lines
    for (let j = i + 1; j < lines.length && j <= i + 10; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop at next domain heading
      if (/^##\s/.test(fwd)) break;

      // Detect premium label
      if (PREMIUM_RE.test(fwd)) isPremium = true;

      // Detect explicit taken signal (not premium "Make offer")
      if (TAKEN_RE.test(fwd)) isTaken = true;
      if (MAKE_OFFER_RE.test(fwd)) hasMakeOffer = true;

      // Extract bold USD price: **$X.XX/yr**
      if (registration == null) {
        const usdMatch = fwd.match(BOLD_USD_PRICE_RE);
        if (usdMatch) {
          registration = parseFloat(usdMatch[1].replace(/,/g, ""));
        }
      }

      // Extract bold EUR price: **€X.XX** (convert to USD)
      if (registration == null) {
        const eurMatch = fwd.match(BOLD_EUR_PRICE_RE);
        if (eurMatch) {
          const eurVal = parseFloat(eurMatch[1].replace(/,/g, ""));
          registration = Math.round(eurVal * EUR_TO_USD * 100) / 100;
        }
      }

      // Extract renewal price
      if (renewal == null) {
        const renewalMatch = fwd.match(RENEWAL_RE);
        if (renewalMatch) {
          renewal = parseFloat(renewalMatch[1].replace(/,/g, ""));
        }
      }
    }

    // "Make offer" without a price or "Taken" label = actually taken
    // "Premium" + "Make offer" with no price = taken premium (can't register)
    if (hasMakeOffer && registration == null) {
      isTaken = true;
    }

    // High price = premium
    if (!isPremium && registration != null && registration >= PREMIUM_PRICE_THRESHOLD) {
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

  const WAIT_MS = 2000;
  console.log(`[${NAME}] Scraping: ${url} (waitFor=${WAIT_MS}ms)`);

  try {
    const result = await firecrawlScrape(url, WAIT_MS, process.env.FIRECRAWL_API_KEY_NAMECHEAP ?? "");
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

    const hits = parseNamecheapMarkdown(result.markdown, buildBuyUrl);

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
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
}

const namecheap: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default namecheap;
