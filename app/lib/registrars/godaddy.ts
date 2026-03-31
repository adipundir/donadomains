import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "GoDaddy";

const SEARCH_URL = (q: string) =>
  `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(q)}`;

const HEADING_DOMAIN_RE = /^##\s+([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})\s*$/i;
const PRICE_RE = /\$([\d,]+(?:\.\d{1,2})?)/g;
const STRIKETHROUGH_PRICE_RE = /~~\$([\d,]+(?:\.\d{1,2})?)~~/g;
const TAKEN_RE = /domain taken|help you get it|broker service/i;
const PREMIUM_RE = /\bpremium\b/i;
const BUY_PRICE_RE = /Buy\s+\$([\d,]+(?:\.\d{1,2})?)/i;
const PREMIUM_PRICE_THRESHOLD = 500;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com", "wsimg.com", "img6.wsimg.com",
]);

/**
 * Parse GoDaddy search markdown.
 *
 * Format:
 *   Domain Taken             <- taken signal BEFORE domain
 *   ## techstartup.com       <- domain as h2 heading
 *   We might be able to help you get it
 *   ---
 *   ## techstartup.us        <- available domain
 *   More Like This
 *   $7.99~~$19.99~~          <- price with strikethrough original
 *
 * Taken: "Domain Taken" before heading, "help you get it", "Broker Service"
 * Premium: "Premium" + phone, "Buy $X,XXX" format
 * Price: use the non-strikethrough price; ignore ~~$X.XX~~ (original/crossed-out)
 */
export function parseGodaddyMarkdown(
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

    // Check backward context (up to 4 non-empty lines) for taken signals
    // Stop at separators (---) or previous headings (##) to avoid bleeding
    let backTaken = false;
    let backCount = 0;
    for (let j = i - 1; j >= 0 && j >= i - 6 && backCount < 4; j--) {
      const bLine = lines[j].trim();
      if (!bLine) continue;
      // Stop at separator or previous domain heading — context belongs to previous domain
      if (/^-{3,}$/.test(bLine) || /^##\s/.test(bLine)) break;
      backCount++;
      if (TAKEN_RE.test(bLine)) { backTaken = true; break; }
    }

    // Forward context until next heading or 10 raw lines
    let isTaken = backTaken;
    let isPremium = false;
    let registration: number | undefined;

    for (let j = i + 1; j < lines.length && j <= i + 10; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop at next heading (next domain) or separator
      if (/^##\s/.test(fwd) || /^-{3,}$/.test(fwd)) break;

      if (TAKEN_RE.test(fwd)) isTaken = true;
      // "Premium(480) 366-3343 for help" is GoDaddy's support phone, not a premium label
      if (PREMIUM_RE.test(fwd) && !/non[- ]?premium/i.test(fwd) && !/premium\s*\(\d/i.test(fwd)) isPremium = true;

      // Check for "Buy $X,XXX" premium format
      const buyMatch = fwd.match(BUY_PRICE_RE);
      if (buyMatch) {
        const val = parseFloat(buyMatch[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0) {
          registration = val;
          if (val >= PREMIUM_PRICE_THRESHOLD) isPremium = true;
        }
      }

      // Extract price: remove strikethrough prices first, then take the remaining
      // Skip "You pay $X today" upsell lines (multi-year bundle prices)
      if (/you pay/i.test(fwd)) continue;
      if (fwd.includes("$") && registration == null) {
        // Remove strikethrough prices (original/crossed-out)
        const withoutStrike = fwd.replace(STRIKETHROUGH_PRICE_RE, "");

        const prices: number[] = [];
        let m: RegExpExecArray | null;
        PRICE_RE.lastIndex = 0;
        while ((m = PRICE_RE.exec(withoutStrike)) !== null) {
          const val = parseFloat(m[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) prices.push(val);
        }
        if (prices.length > 0) {
          registration = Math.min(...prices);
        }
      }
    }

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

  console.log(`[${NAME}] Scraping: ${url} (waitFor=5000ms)`);

  try {
    const result = await firecrawlScrape(url, 5000);
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

    const hits = parseGodaddyMarkdown(result.markdown, buildBuyUrl);

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
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(domain)}`;
}

const godaddy: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default godaddy;
