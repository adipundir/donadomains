import type { RegistrarSearchHit, RegistrarSearchResult } from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const PREMIUM_STRONG_RE = /aftermarket|make\s+an?\s+offer|auction|backorder/i;
const PREMIUM_LABEL_RE = /\bpremium\b/i;
const PREMIUM_DISCLAIMER_RE = /non[- ]?premium|not applicable to premium|premium domains only|premium names|auctionspremium|premiumgenerator/i;
const TAKEN_RE = /taken|unavailable|registered|not available|sorry/i;
const PREMIUM_PRICE_THRESHOLD = 500;
const CONTEXT_LINES = 6;

const DOMAIN_RE =
  /([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|co|dev|app|ai|xyz|me|info|biz|us|tv|online|site|tech|store|club|world|live|shop|blog|uk))\b/gi;

const URL_CONTEXT_RE = /https?:\/\/|!\[|\.png|\.jpg|\.svg|\.gif|\.webp|\.css|\.js/i;
const INFRA_DOMAINS = new Set([
  "godaddy.com", "porkbun.com", "namecheap.com", "spaceship.com",
  "cloudflare.com", "wsimg.com", "img6.wsimg.com",
  "dynadot.com", "name.com", "hover.com", "hostinger.com", "squarespace.com",
]);

/**
 * Patterns that indicate a dollar amount is NOT a registration price.
 * These are stripped from context before price extraction.
 */
const PROMO_PRICE_PATTERNS: RegExp[] = [
  /\bsave\s+\$[\d,.]+/gi,            // "Save $2.53"
  /\bsaving[s]?\s+(?:of\s+)?\$[\d,.]+/gi, // "Savings of $5.00"
  /\$[\d,.]+\s+off\b/gi,             // "$5 off"
  /\bfor\s+only\s+\$[\d,.]+/gi,      // "for only $21.07" (bundle)
  /~~\$[\d,.]+~~/g,                   // "~~$12.99~~" (markdown strikethrough)
  /\bwas\s+\$[\d,.]+/gi,             // "was $12.99" (old price)
  /\boriginal(?:ly)?\s+\$[\d,.]+/gi, // "originally $12.99"
];

/** Price with a yearly indicator — high confidence it's a registration price. */
const YEARLY_PRICE_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*[\/\s]*(?:yr|year|per\s+year|annually|\/\s*1\s*yr)/i;
/** Bare dollar amount — lower confidence. */
const BARE_PRICE_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)/;
/** Renewal price. */
const RENEWAL_RE = /renew(?:s|al)?(?:\s+(?:at|price))?\s*[^$]{0,20}\$\s*([\d,]+(?:\.\d{1,2})?)/i;

/** Remove markdown bold/italic/strikethrough markers so `**$21.07**` becomes `$21.07`. */
function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*{1,3}(\$[\d,.]+(?:\/\w+)?)\*{1,3}/g, "$1")
    .replace(/~~(\$[\d,.]+(?:\/\w+)?)~~/g, "$1")
    .replace(/__(\$[\d,.]+(?:\/\w+)?)__/g, "$1")
    .replace(/\*{1,3}/g, "")
    .replace(/~~/g, "");
}

function stripPromoPrices(text: string): string {
  let cleaned = stripMarkdownFormatting(text);
  for (const re of PROMO_PRICE_PATTERNS) {
    re.lastIndex = 0;
    cleaned = cleaned.replace(re, "");
  }
  return cleaned;
}

function extractPrice(text: string): number | undefined {
  const yearly = text.match(YEARLY_PRICE_RE);
  const bare = text.match(BARE_PRICE_RE);
  const match = yearly || bare;
  if (!match) return undefined;
  const val = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(val) ? undefined : val;
}

/**
 * Parse Firecrawl markdown into domain search hits.
 *
 * Uses a context-window approach: for each domain mention on a "clean" line
 * (not inside a URL/image), checks nearby lines for taken/premium indicators
 * and prices. Promotional/savings amounts are stripped before price extraction.
 * Multiple mentions of the same domain are merged — later year-indicated prices
 * can override earlier bare prices.
 */
export function parseSearchMarkdown(
  markdown: string,
  buildBuyUrl: (domain: string) => string,
): RegistrarSearchHit[] {
  const hitMap = new Map<string, RegistrarSearchHit>();
  const hitPriceIsYearly = new Map<string, boolean>();
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (URL_CONTEXT_RE.test(line)) continue;

    const domainMatches = [...line.matchAll(DOMAIN_RE)];
    if (domainMatches.length === 0) continue;

    const ctxEnd = Math.min(lines.length, i + CONTEXT_LINES + 1);
    const rawContext = lines.slice(i, ctxEnd).join("\n");
    const ctxLower = rawContext.toLowerCase();

    const isTaken = TAKEN_RE.test(ctxLower);
    const isPremium = PREMIUM_STRONG_RE.test(ctxLower) ||
      (PREMIUM_LABEL_RE.test(ctxLower) && !PREMIUM_DISCLAIMER_RE.test(ctxLower));

    const cleanContext = stripPromoPrices(rawContext);
    const price = extractPrice(cleanContext);
    const hasYearlyIndicator = price != null && YEARLY_PRICE_RE.test(cleanContext);

    const looksLikePremiumPrice = price != null && price >= PREMIUM_PRICE_THRESHOLD;
    const markedPremium = isPremium || looksLikePremiumPrice;

    const renewalMatch = cleanContext.match(RENEWAL_RE);
    const renewal = renewalMatch ? parseFloat(renewalMatch[1].replace(/,/g, "")) : undefined;

    for (const m of domainMatches) {
      const domain = m[1].toLowerCase();
      if (INFRA_DOMAINS.has(domain)) continue;

      const existing = hitMap.get(domain);

      if (existing) {
        if (markedPremium) existing.premium = true;
        if (isTaken || markedPremium) existing.available = false;

        const prevIsYearly = hitPriceIsYearly.get(domain) ?? false;
        const shouldOverride =
          existing.registration == null ||
          (hasYearlyIndicator && !prevIsYearly);

        if (price != null && shouldOverride) {
          existing.registration = price;
          hitPriceIsYearly.set(domain, hasYearlyIndicator);
        }
        if (renewal != null && (existing.renewal == null || (hasYearlyIndicator && !prevIsYearly))) {
          existing.renewal = renewal;
        }
      } else {
        hitMap.set(domain, {
          domain,
          available: !isTaken && !markedPremium && price != null,
          premium: markedPremium || undefined,
          registration: price,
          renewal,
          currency: "USD",
          buyUrl: buildBuyUrl(domain),
        });
        hitPriceIsYearly.set(domain, hasYearlyIndicator);
      }
    }
  }

  return [...hitMap.values()];
}

/** Log every hit from a registrar search in a readable table format. */
export function logSearchHits(registrar: string, hits: RegistrarSearchHit[]): void {
  if (hits.length === 0) {
    console.log(`[${registrar}]   (no domains parsed)`);
    return;
  }
  const available = hits.filter(h => h.available);
  const taken = hits.filter(h => !h.available && !h.premium);
  const premium = hits.filter(h => h.premium);

  if (available.length > 0) {
    console.log(`[${registrar}]   ✅ Available (${available.length}):`);
    for (const h of available) {
      const price = h.registration != null ? `$${h.registration}` : "no price";
      const renew = h.renewal != null ? ` (renews $${h.renewal})` : "";
      console.log(`[${registrar}]      ${h.domain} — ${price}/yr${renew}`);
    }
  }
  if (premium.length > 0) {
    console.log(`[${registrar}]   💎 Premium/Aftermarket (${premium.length}):`);
    for (const h of premium.slice(0, 10)) {
      const price = h.registration != null ? `$${h.registration.toLocaleString()}` : "no price";
      console.log(`[${registrar}]      ${h.domain} — ${price}`);
    }
    if (premium.length > 10) {
      console.log(`[${registrar}]      ... and ${premium.length - 10} more`);
    }
  }
  if (taken.length > 0) {
    console.log(`[${registrar}]   ❌ Taken (${taken.length}):`);
    for (const h of taken.slice(0, 5)) {
      console.log(`[${registrar}]      ${h.domain}`);
    }
    if (taken.length > 5) {
      console.log(`[${registrar}]      ... and ${taken.length - 5} more`);
    }
  }
}

/** Log a truncated preview of the raw Firecrawl markdown response. */
export function logRawMarkdown(registrar: string, markdown: string, maxLines = 40): void {
  const lines = markdown.split("\n").filter(l => l.trim().length > 0);
  const preview = lines.slice(0, maxLines);
  console.log(`[${registrar}]   ── Raw response (${lines.length} non-empty lines) ──`);
  for (const line of preview) {
    console.log(`[${registrar}]   │ ${line.length > 120 ? line.slice(0, 117) + "..." : line}`);
  }
  if (lines.length > maxLines) {
    console.log(`[${registrar}]   │ ... ${lines.length - maxLines} more lines`);
  }
  console.log(`[${registrar}]   ── End raw response ──`);
}

/**
 * Scrape a registrar search page and extract domain results.
 *
 * Uses Firecrawl to render the JS-heavy page, then parses the markdown
 * with regex. Markdown formatting is stripped and promotional/savings
 * text is filtered before price extraction.
 */
export async function searchRegistrarPage(
  registrarName: string,
  url: string,
  buildBuyUrl: (domain: string) => string,
  waitMs = 6000,
): Promise<{ hits: RegistrarSearchHit[]; fetchTimeMs: number; error?: string }> {
  const start = Date.now();
  console.log(`[${registrarName}] Searching: ${url}`);

  try {
    const result = await firecrawlScrape(url, waitMs);
    const elapsed = Date.now() - start;

    if (!result.success || !result.markdown) {
      console.log(`[${registrarName}] ✗ Scrape failed (${elapsed}ms): ${result.error}`);
      return { hits: [], fetchTimeMs: elapsed, error: result.error };
    }

    console.log(`[${registrarName}] ← Scraped ${result.markdown.length} chars (${elapsed}ms)`);
    logRawMarkdown(registrarName, result.markdown);
    const hits = parseSearchMarkdown(result.markdown, buildBuyUrl);
    const avail = hits.filter((h) => h.available).length;
    console.log(`[${registrarName}] ✓ Found ${hits.length} domains (${avail} available)`);
    logSearchHits(registrarName, hits);
    return { hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`[${registrarName}] ✗ Error (${elapsed}ms): ${(err as Error).message}`);
    return { hits: [], fetchTimeMs: elapsed, error: (err as Error).message };
  }
}
