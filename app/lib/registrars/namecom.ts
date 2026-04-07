import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "Name.com";

const SEARCH_URL = (q: string) =>
  `https://www.name.com/domain/search/${encodeURIComponent(q)}`;

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})$/i;
const PRICE_RE = /\$([\d,]+(?:\.\d{1,2})?)/g;
const RENEWAL_RE = /Renewal\s+\$([\d,]+(?:\.\d{1,2})?)/i;
const TAKEN_RE = /\bMake Offer\b/i;
const PREMIUM_RE = /\bpremium\b/i;
const PREMIUM_PRICE_THRESHOLD = 500;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com",
]);

/**
 * Parse Name.com search markdown.
 *
 * Format:
 *   techstartup.com          <- domain on its own line
 *   Make Offer               <- taken signal (skip)
 *   techstartup.video        <- next domain
 *   This domain free with Titan Email   <- ignorable
 *   $52.99$14.99Renewal $39.99          <- prices concatenated
 *
 * Taken: "Make Offer" on following line
 * Premium: "Premium" label, or price > $500
 */
export function parseNamecomMarkdown(
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

    let isTaken = false;
    let isPremium = false;
    let registration: number | undefined;
    let renewal: number | undefined;

    for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop if we hit the next domain
      if (DOMAIN_RE.test(fwd)) break;

      if (TAKEN_RE.test(fwd)) { isTaken = true; break; }
      if (PREMIUM_RE.test(fwd) && !/non[- ]?premium/i.test(fwd)) isPremium = true;

      // Extract renewal
      const renewalMatch = fwd.match(RENEWAL_RE);
      if (renewalMatch && renewal == null) {
        renewal = parseFloat(renewalMatch[1].replace(/,/, ""));
      }

      // Extract prices — Name.com concatenates: "$52.99$14.99Renewal $39.99"
      if (fwd.includes("$")) {
        // Strip the renewal portion before extracting registration prices
        const withoutRenewal = fwd.replace(/Renewal\s+\$[\d,.]+/i, "");
        const prices: number[] = [];
        let m: RegExpExecArray | null;
        PRICE_RE.lastIndex = 0;
        while ((m = PRICE_RE.exec(withoutRenewal)) !== null) {
          const val = parseFloat(m[1].replace(/,/, ""));
          if (!isNaN(val) && val > 0) prices.push(val);
        }
        if (prices.length > 0 && registration == null) {
          // If two prices, the lower one is the sale price
          registration = prices.length >= 2 ? Math.min(...prices) : prices[0];
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

  console.log(`[${NAME}] Scraping: ${url} (waitFor=2000ms)`);

  try {
    const result = await firecrawlScrape(url, 2000, process.env.FIRECRAWL_API_KEY_NAMECOM ?? "");
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

    const hits = parseNamecomMarkdown(result.markdown, buildBuyUrl);

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
  return `https://www.name.com/domain/search/${encodeURIComponent(domain)}`;
}

const namecom: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default namecom;
