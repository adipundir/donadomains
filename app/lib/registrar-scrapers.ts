/**
 * Legacy registrar scrapers — REPLACED by ./registrars/ module.
 * Kept for backward compatibility with test scripts.
 */
import { preloadAllPricing, getBuyLinks } from "./registrars";

export interface ScrapedResult {
  price?: string;
  priceNum?: number;
  available?: boolean;
  raw?: string;
}

async function getPrice(domain: string, registrar: string): Promise<ScrapedResult | null> {
  await preloadAllPricing();
  const link = getBuyLinks(domain).find((l) => l.name === registrar);
  if (link?.priceNum != null) return { price: link.price, priceNum: link.priceNum };
  return null;
}

export async function scrapeGoDaddy(domain: string): Promise<ScrapedResult | null> {
  return getPrice(domain, "GoDaddy");
}

export async function scrapeNamecheap(domain: string): Promise<ScrapedResult | null> {
  return getPrice(domain, "Namecheap");
}

export async function scrapeCloudflare(domain: string): Promise<ScrapedResult | null> {
  return getPrice(domain, "Cloudflare");
}
