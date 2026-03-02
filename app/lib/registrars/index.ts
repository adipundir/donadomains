import type { RegistrarModule, RegistrarFetchResult, BuyLink } from "./types";
import porkbun from "./porkbun";
import godaddy from "./godaddy";
import namecheap from "./namecheap";
import cloudflare from "./cloudflare";
import spaceship from "./spaceship";

export type { BuyLink, RegistrarFetchResult } from "./types";

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
 * Fetch pricing from all registrar APIs in parallel.
 * Must be called (and awaited!) before getBuyLinks.
 *
 * - Porkbun: awaits live API (~20s first call, instant after cache)
 * - GoDaddy: awaits API if GODADDY_API_KEY + GODADDY_API_SECRET set
 * - Namecheap: awaits API if NAMECHEAP_API_USER + NAMECHEAP_API_KEY + NAMECHEAP_API_IP set
 * - Cloudflare: instant (static at-cost)
 * - Spaceship: instant (static)
 */
export async function preloadAllPricing(): Promise<RegistrarFetchResult[]> {
  if (preloaded && preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const start = Date.now();
    console.log("\n[Registrars] ═══════════════════════════════════════════════════");
    console.log("[Registrars] Fetching pricing from all registrars in parallel...");
    console.log(`[Registrars] Active: ${ALL_REGISTRARS.map((r) => r.name).join(", ")}`);

    const results = await Promise.all(
      ALL_REGISTRARS.map((r) => r.fetchPricing())
    );

    const elapsed = Date.now() - start;
    console.log(`\n[Registrars] ── Results (${elapsed}ms total) ──`);

    for (const r of results) {
      const icon = r.source === "api" ? "✓" : "○";
      const detail = r.error ? ` — ${r.error}` : "";
      console.log(`[Registrars]   ${icon} ${r.registrar}: ${r.source.toUpperCase()} (${r.tldCount} TLDs, ${r.fetchTimeMs}ms)${detail}`);
    }

    console.log("[Registrars] ═══════════════════════════════════════════════════\n");
    preloaded = true;
    return results;
  })();

  return preloadPromise;
}

/**
 * Get buy links with pricing for a domain across all registrars.
 * Only returns registrars with live API-backed prices — no hardcoded/static values.
 * Call preloadAllPricing() first — this is synchronous and returns instantly.
 */
export function getBuyLinks(domain: string, log = false): BuyLink[] {
  const tld = domain.includes(".") ? domain.split(".").slice(1).join(".") : "";
  if (!tld) return [];

  const links: BuyLink[] = [];

  for (const registrar of ALL_REGISTRARS) {
    const priceData = registrar.getPrice(tld);
    if (!priceData || priceData.source !== "api") continue;
    const link: BuyLink = {
      name: registrar.name,
      url: registrar.buildBuyUrl(domain),
      price: `$${priceData.registration.toFixed(2)}/yr`,
      priceNum: priceData.registration,
      renewalPrice: `$${priceData.renewal.toFixed(2)}/yr`,
      renewalPriceNum: priceData.renewal,
      source: "api",
    };
    links.push(link);
  }

  const withPrice = links.filter((l) => l.priceNum != null);
  if (withPrice.length > 0) {
    const minPrice = Math.min(...withPrice.map((l) => l.priceNum!));
    for (const l of withPrice) {
      if (l.priceNum === minPrice) l.isCheapest = true;
    }
  }

  if (log) {
    const parts = links.map((l) => `${l.name}=$${l.priceNum!.toFixed(2)}`);
    console.log(`[Pricing][${domain}] ${parts.length ? parts.join(" | ") : "no API pricing available"}`);
  }

  return links;
}
