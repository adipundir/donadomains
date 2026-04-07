import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
} from "./types";
import { firecrawlScrape } from "./firecrawl-client";

const NAME = "Dynadot";

const SEARCH_URL = (q: string) =>
  `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(q)}`;

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,}\.)?[a-z]{2,})$/i;
const PRICE_RE = /\$([\d,]+(?:\.\d{1,2})?)/g;
const RENEWAL_RE = /Renewal\s+\$([\d,]+(?:\.\d{1,2})?)/i;
const TAKEN_RE = /\btaken\b|hire a broker/i;
const PREMIUM_RE = /\bpremium\b/i;

const INFRA_DOMAINS = new Set([
  "dynadot.com", "godaddy.com", "porkbun.com", "namecheap.com",
  "cloudflare.com", "name.com", "hover.com",
]);

/**
 * Parse Dynadot search markdown.
 *
 * Format:
 *   techstartup.sbs          <- domain on its own line
 *   Renewal $13.06           <- renewal (optional)
 *   $13.06$1.24              <- prices: original or original+sale concatenated
 *
 * Taken: "Taken" or "Hire a Broker" in following lines
 * Premium: "Premium" on own line after domain
 */
export function parseDynadotMarkdown(
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

    // Collect forward context until next domain or 8 raw lines
    let isTaken = false;
    let isPremium = false;
    let registration: number | undefined;
    let renewal: number | undefined;

    for (let j = i + 1; j < lines.length && j <= i + 10; j++) {
      const fwd = lines[j].trim();
      if (!fwd) continue;

      // Stop if we hit the next domain
      if (DOMAIN_RE.test(fwd)) break;

      // Skip noise: images, links without prices, bundle offers
      if (fwd.startsWith("![") || fwd.startsWith("[") && !fwd.includes("$")) continue;
      if (/bundle/i.test(fwd)) continue;

      if (TAKEN_RE.test(fwd)) isTaken = true;
      if (PREMIUM_RE.test(fwd) && !/non[- ]?premium/i.test(fwd)) isPremium = true;

      // Extract renewal price
      const renewalMatch = fwd.match(RENEWAL_RE);
      if (renewalMatch && renewal == null) {
        renewal = parseFloat(renewalMatch[1].replace(/,/, ""));
      }

      // Extract prices from a line with $ signs
      // Dynadot concatenates: "$13.06$1.24" means original=$13.06, sale=$1.24
      if (fwd.includes("$") && !RENEWAL_RE.test(fwd)) {
        const prices: number[] = [];
        let m: RegExpExecArray | null;
        PRICE_RE.lastIndex = 0;
        while ((m = PRICE_RE.exec(fwd)) !== null) {
          const val = parseFloat(m[1].replace(/,/, ""));
          if (!isNaN(val) && val > 0) prices.push(val);
        }
        if (prices.length > 0 && registration == null) {
          // If two prices concatenated, the second (lower) is the sale price
          registration = prices.length >= 2 ? Math.min(...prices) : prices[0];
        }
      }
    }

    // High price without explicit "premium" label still indicates premium/aftermarket
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

  const WAIT_MS = 5000;
  console.log(`[${NAME}] Scraping: ${url} (waitFor=${WAIT_MS}ms)`);

  try {
    const result = await firecrawlScrape(url, WAIT_MS, process.env.FIRECRAWL_API_KEY_DYNADOT ?? "");
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

    const hits = parseDynadotMarkdown(result.markdown, buildBuyUrl);

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
  return `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(domain)}`;
}

const dynadot: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default dynadot;
