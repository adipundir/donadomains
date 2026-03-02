/**
 * Registrar fetchers: fetch domain pricing from each registrar.
 * Delegates to the modular registrar system in ./registrars/.
 */
import { preloadAllPricing, getBuyLinks, type BuyLink } from "./registrars";

export interface RegistrarResult {
  registrar: string;
  price?: string;
  priceNum?: number;
  available?: boolean;
  source: "api" | "static";
  error?: string;
}

function toResult(link: BuyLink | undefined, registrar: string): RegistrarResult {
  if (link?.priceNum != null) {
    return { registrar, price: link.price, priceNum: link.priceNum, source: link.source };
  }
  return { registrar, source: "static", error: "No pricing for this TLD" };
}

export async function fetchFromGodaddy(domain: string): Promise<RegistrarResult> {
  await preloadAllPricing();
  return toResult(getBuyLinks(domain).find((l) => l.name === "GoDaddy"), "GoDaddy");
}

export async function fetchFromNamecheap(domain: string): Promise<RegistrarResult> {
  await preloadAllPricing();
  return toResult(getBuyLinks(domain).find((l) => l.name === "Namecheap"), "Namecheap");
}

export async function fetchFromPorkbun(domain: string): Promise<RegistrarResult> {
  await preloadAllPricing();
  return toResult(getBuyLinks(domain).find((l) => l.name === "Porkbun"), "Porkbun");
}

export async function fetchFromSpaceship(domain: string): Promise<RegistrarResult> {
  await preloadAllPricing();
  return toResult(getBuyLinks(domain).find((l) => l.name === "Spaceship"), "Spaceship");
}

export async function fetchFromCloudflare(domain: string): Promise<RegistrarResult> {
  await preloadAllPricing();
  return toResult(getBuyLinks(domain).find((l) => l.name === "Cloudflare"), "Cloudflare");
}

export async function fetchAllRegistrarPrices(domain: string): Promise<RegistrarResult[]> {
  await preloadAllPricing();
  return getBuyLinks(domain).map((l) => ({
    registrar: l.name,
    price: l.price,
    priceNum: l.priceNum,
    source: l.source,
  }));
}
