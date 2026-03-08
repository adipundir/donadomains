import type { RegistrarSearchHit } from "./types";

const PREMIUM_STRONG_RE = /aftermarket|make\s+an?\s+offer|auction|backorder/i;
const PREMIUM_LABEL_RE = /\bpremium\b/i;
const PREMIUM_DISCLAIMER_RE = /non[- ]?premium|not applicable to premium|premium domains only|premium names|auctionspremium|premiumgenerator/i;
const TAKEN_RE = /taken|unavailable|registered|not available|sorry/i;
const PREMIUM_PRICE_THRESHOLD = 500;
const CONTEXT_LINES = 8;

const DOMAIN_RE =
  /([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|co|dev|app|ai|xyz|me|info|biz|us|tv|online|site|tech|store|club|world|live|shop|blog|uk))\b/gi;

/** Skip domains that appear inside URLs, image paths, or are registrar infrastructure. */
const URL_CONTEXT_RE = /https?:\/\/|!\[|\.png|\.jpg|\.svg|\.gif|\.webp|\.css|\.js/i;
const INFRA_DOMAINS = new Set([
  "godaddy.com", "porkbun.com", "namecheap.com", "spaceship.com",
  "cloudflare.com", "wsimg.com", "img6.wsimg.com",
]);

/**
 * Parse Firecrawl markdown into domain search hits.
 *
 * Uses a context-window approach: for each domain mention on a "clean" line
 * (not inside a URL/image), checks the next CONTEXT_LINES for taken/premium
 * indicators and prices. Multiple mentions of the same domain are merged —
 * if ANY mention flags it as premium/taken, the hit is upgraded.
 */
export function parseSearchMarkdown(
  markdown: string,
  buildBuyUrl: (domain: string) => string,
): RegistrarSearchHit[] {
  const hitMap = new Map<string, RegistrarSearchHit>();
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that are clearly URLs, image refs, or link markdown
    if (URL_CONTEXT_RE.test(line)) continue;

    const domainMatches = [...line.matchAll(DOMAIN_RE)];
    if (domainMatches.length === 0) continue;

    const ctxEnd = Math.min(lines.length, i + CONTEXT_LINES + 1);
    const context = lines.slice(i, ctxEnd).join("\n");
    const ctxLower = context.toLowerCase();

    const isTaken = TAKEN_RE.test(ctxLower);
    const isPremium = PREMIUM_STRONG_RE.test(ctxLower) ||
      (PREMIUM_LABEL_RE.test(ctxLower) && !PREMIUM_DISCLAIMER_RE.test(ctxLower));
    const priceMatch = context.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : undefined;
    const looksLikePremiumPrice = price != null && price >= PREMIUM_PRICE_THRESHOLD;
    const markedPremium = isPremium || looksLikePremiumPrice;

    const renewalMatch = context.match(/renew(?:al)?[^$]*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    const renewal = renewalMatch ? parseFloat(renewalMatch[1].replace(/,/g, "")) : undefined;

    for (const m of domainMatches) {
      const domain = m[1].toLowerCase();
      if (INFRA_DOMAINS.has(domain)) continue;

      const existing = hitMap.get(domain);

      if (existing) {
        if (markedPremium) existing.premium = true;
        if (isTaken || markedPremium) existing.available = false;
        if (price != null && existing.registration == null) existing.registration = price;
        if (renewal != null && existing.renewal == null) existing.renewal = renewal;
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
