import type {
  RegistrarModule,
  RegistrarSearchResult,
  RegistrarSearchHit,
  BuyLink,
} from "./types";
import godaddy from "./godaddy";
import namecheap from "./namecheap";
import spaceship from "./spaceship";
import dynadot from "./dynadot";
import namecom from "./namecom";
import hover from "./hover";
import hostinger from "./hostinger";
import squarespace from "./squarespace";

export type { BuyLink, RegistrarSearchResult, RegistrarSearchHit } from "./types";

const ALL_REGISTRARS: RegistrarModule[] = [
  namecheap,
  godaddy,
  spaceship,
  dynadot,
  namecom,
  hover,
  hostinger,
  squarespace,
];

/**
 * Search ALL registrar websites in parallel with the user's query.
 *
 * Each registrar makes ONE request to its search page (via Firecrawl),
 * which returns availability + pricing for many TLDs at once.
 * This is far more efficient than checking each domain individually.
 */
const SEARCH_TIMEOUT_MS = 15_000;

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
 * Build buy links from registrar search results (scraped prices only).
 */
export function buildMergedBuyLinks(
  domain: string,
  searchHits: Map<string, RegistrarSearchHit>,
): BuyLink[] {
  const links: BuyLink[] = [];

  for (const [registrar, hit] of searchHits) {
    if (hit.premium) continue;
    if (hit.registration != null) {
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

export function getBuyLinks(domain: string): BuyLink[] {
  return buildMergedBuyLinks(domain, new Map());
}
