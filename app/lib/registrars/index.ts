import type {
  RegistrarModule,
  RegistrarFetchResult,
  RegistrarSearchResult,
  RegistrarSearchHit,
  BuyLink,
} from "./types";
import porkbun from "./porkbun";
import godaddy from "./godaddy";
import namecheap from "./namecheap";
import cloudflare from "./cloudflare";
import spaceship from "./spaceship";

export type { BuyLink, RegistrarFetchResult, RegistrarSearchResult, RegistrarSearchHit } from "./types";

const ALL_REGISTRARS: RegistrarModule[] = [
  porkbun,
  cloudflare,
  namecheap,
  godaddy,
  spaceship,
];

let preloaded = false;
let preloadPromise: Promise<RegistrarFetchResult[]> | null = null;

/**
 * Preload bulk TLD pricing from all registrars.
 * This populates the getPrice() cache so pricing can be attached
 * to domains that weren't found in registrar search results.
 */
export async function preloadAllPricing(): Promise<RegistrarFetchResult[]> {
  if (preloaded && preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const start = Date.now();
    console.log("\n[Registrars] ═══════════════════════════════════════════════");
    console.log("[Registrars] Preloading bulk pricing...");

    const results = await Promise.all(ALL_REGISTRARS.map((r) => r.fetchPricing()));
    const elapsed = Date.now() - start;

    console.log(`[Registrars] ── Pricing ready (${elapsed}ms) ──`);
    for (const r of results) {
      const icon = r.source === "api" ? "✓" : "○";
      console.log(`[Registrars]   ${icon} ${r.registrar}: ${r.source.toUpperCase()} (${r.tldCount} TLDs, ${r.fetchTimeMs}ms)`);
    }
    console.log("[Registrars] ═══════════════════════════════════════════════\n");

    preloaded = true;
    return results;
  })();

  return preloadPromise;
}

/**
 * Search ALL registrar websites in parallel with the user's query.
 *
 * Each registrar makes ONE request to its search page (via Firecrawl),
 * which returns availability + pricing for many TLDs at once.
 * This is far more efficient than checking each domain individually.
 */
const SEARCH_TIMEOUT_MS = 15_000;

export async function searchAllRegistrars(query: string): Promise<RegistrarSearchResult[]> {
  const start = Date.now();
  console.log("\n[Search] ═══════════════════════════════════════════════════");
  console.log(`[Search] Searching ${ALL_REGISTRARS.length} registrars for "${query}"...`);

  const results = await Promise.all(
    ALL_REGISTRARS.map(async (r) => {
      try {
        return await Promise.race([
          r.searchDomains(query),
          new Promise<RegistrarSearchResult>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), SEARCH_TIMEOUT_MS)
          ),
        ]);
      } catch {
        return { registrar: r.name, hits: [], fetchTimeMs: SEARCH_TIMEOUT_MS, error: "Search timed out" } as RegistrarSearchResult;
      }
    })
  );

  const elapsed = Date.now() - start;
  console.log(`\n[Search] ── Registrar search results (${elapsed}ms) ──`);

  let totalHits = 0;
  for (const r of results) {
    const icon = r.hits.length > 0 ? "✓" : "○";
    const avail = r.hits.filter((h) => h.available).length;
    const errStr = r.error ? ` — ${r.error}` : "";
    console.log(`[Search]   ${icon} ${r.registrar}: ${r.hits.length} hits (${avail} available, ${r.fetchTimeMs}ms)${errStr}`);
    totalHits += r.hits.length;
  }

  console.log(`[Search] Total: ${totalHits} hits from ${results.filter((r) => r.hits.length > 0).length} registrars`);
  console.log("[Search] ═══════════════════════════════════════════════════\n");

  return results;
}

/**
 * Build buy links for a domain by merging:
 * 1. Live search hits (scraped prices from registrar search pages)
 * 2. Live bulk pricing APIs (Porkbun API, Cloudflare GitHub data)
 *
 * Search hits take priority since they're the freshest prices.
 * Only live data (scraped or API) is included — no hardcoded prices.
 */
export function buildMergedBuyLinks(
  domain: string,
  searchHits: Map<string, RegistrarSearchHit>,
): BuyLink[] {
  const tld = domain.includes(".") ? domain.split(".").slice(1).join(".") : "";
  if (!tld) return [];

  const links: BuyLink[] = [];
  const addedRegistrars = new Set<string>();

  // Phase 1: Add prices from registrar search results (scraped, freshest)
  // Skip premium/aftermarket hits — their prices are not standard registration prices
  for (const [registrar, hit] of searchHits) {
    if (hit.premium) continue;
    if (hit.registration != null) {
      addedRegistrars.add(registrar);
      links.push({
        name: registrar,
        url: hit.buyUrl,
        price: `$${hit.registration.toFixed(2)}/yr`,
        priceNum: hit.registration,
        renewalPrice: hit.renewal != null ? `$${hit.renewal.toFixed(2)}/yr` : undefined,
        renewalPriceNum: hit.renewal,
        source: "scraped",
      });
    }
  }

  // Phase 2: Fill in from bulk pricing APIs for registrars without search hits
  for (const registrar of ALL_REGISTRARS) {
    if (addedRegistrars.has(registrar.name)) continue;
    const priceData = registrar.getPrice(tld);
    if (!priceData) continue;

    links.push({
      name: registrar.name,
      url: registrar.buildBuyUrl(domain),
      price: `$${priceData.registration.toFixed(2)}/yr`,
      priceNum: priceData.registration,
      renewalPrice: `$${priceData.renewal.toFixed(2)}/yr`,
      renewalPriceNum: priceData.renewal,
      source: priceData.source,
    });
  }

  // Mark cheapest
  const priced = links.filter((l) => l.priceNum != null);
  if (priced.length > 0) {
    const minPrice = Math.min(...priced.map((l) => l.priceNum!));
    for (const l of priced) {
      if (l.priceNum === minPrice) l.isCheapest = true;
    }
  }

  // Sort: cheapest first, then by source quality (scraped > api)
  const sourceOrder: Record<string, number> = { scraped: 0, api: 1 };
  links.sort((a, b) => {
    if (a.isCheapest && !b.isCheapest) return -1;
    if (!a.isCheapest && b.isCheapest) return 1;
    const sa = sourceOrder[a.source] ?? 9;
    const sb = sourceOrder[b.source] ?? 9;
    if (sa !== sb) return sa - sb;
    return (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity);
  });

  return links;
}

/** Legacy: get buy links from bulk pricing only (no search hits). */
export function getBuyLinks(domain: string, log = false): BuyLink[] {
  const links = buildMergedBuyLinks(domain, new Map());
  if (log) {
    const parts = links.map((l) => `${l.name}=$${l.priceNum?.toFixed(2)}(${l.source})`);
    console.log(`[Pricing][${domain}] ${parts.length ? parts.join(" | ") : "no pricing"}`);
  }
  return links;
}
