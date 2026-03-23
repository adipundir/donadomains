import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
  BuyLink,
} from "./types";

import godaddy from "./godaddy";
import namecheap from "./namecheap";
import dynadot from "./dynadot";
import namecom from "./namecom";
import hover from "./hover";
import porkbun from "./porkbun";

export type { BuyLink, RegistrarSearchResult, RegistrarSearchHit } from "./types";

// Ordered by reliability + speed so the streaming UI shows results fast.
// Dynadot/Name.com (2s wait, consistent) fill the first batch with GoDaddy.
// Namecheap/Hover (4s wait) in the second batch. Porkbun (15s wait) last.
export const ALL_REGISTRARS: RegistrarModule[] = [
  dynadot,
  namecom,
  godaddy,
  namecheap,
  hover,
  porkbun,
];

/**
 * Search ALL registrar websites in parallel with the user's query.
 *
 * Each registrar makes ONE request to its search page (via Firecrawl),
 * which returns availability + pricing for many TLDs at once.
 * This is far more efficient than checking each domain individually.
 */
const SEARCH_TIMEOUT_MS = 40_000;

export async function searchAllRegistrars(query: string): Promise<RegistrarSearchResult[]> {
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

  return results;
}

/**
 * Build buy links from registrar search results.
 * Simply collects prices, marks the cheapest, and sorts.
 */
export function buildMergedBuyLinks(
  domain: string,
  searchHits: Map<string, RegistrarSearchHit>,
): BuyLink[] {
  const links: BuyLink[] = [];

  for (const [registrar, hit] of searchHits) {
    if (hit.registration != null) {
      links.push({
        name: registrar,
        url: hit.buyUrl,
        price: `$${hit.registration.toFixed(2)}/yr`,
        priceNum: hit.registration,
        premium: hit.premium || undefined,
        source: "scraped",
      });
    }
  }

  // Mark cheapest (non-premium)
  const eligible = links.filter((l) => l.priceNum != null && !l.premium);
  if (eligible.length > 0) {
    const minPrice = Math.min(...eligible.map((l) => l.priceNum!));
    for (const l of eligible) {
      if (l.priceNum === minPrice) l.isCheapest = true;
    }
  }

  // Sort: cheapest first, then by price
  links.sort((a, b) => {
    if (a.isCheapest && !b.isCheapest) return -1;
    if (!a.isCheapest && b.isCheapest) return 1;
    return (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity);
  });

  return links;
}

