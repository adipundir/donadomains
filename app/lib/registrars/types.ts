export interface RegistrarPriceResult {
  registrar: string;
  tld: string;
  registration: number;
  renewal: number;
  currency: "USD";
  source: "api" | "scraped";
  fetchedAt: number;
}

export interface RegistrarFetchResult {
  registrar: string;
  source: "api" | "scraped";
  tldCount: number;
  fetchTimeMs: number;
  error?: string;
}

export interface BuyLink {
  name: string;
  url: string;
  price?: string;
  priceNum?: number;
  renewalPrice?: string;
  renewalPriceNum?: number;
  isCheapest?: boolean;
  source: "api" | "scraped";
}

export type PricingMap = Map<string, RegistrarPriceResult>;

/** A single domain result returned by a registrar's search page. */
export interface RegistrarSearchHit {
  domain: string;
  available: boolean;
  /**
   * True only when the registrar's page explicitly said "taken", "unavailable",
   * "registered", etc. False/absent means the domain appeared in results but
   * without a clear taken signal (e.g. no price, unsupported TLD).
   * This is distinct from `available: false`, which also triggers when pricing
   * is missing — so we don't mistake "no price" for "domain is registered".
   */
  explicitlyTaken?: boolean;
  /** Domain is listed as premium or aftermarket (not available at standard price). */
  premium?: boolean;
  registration?: number;
  renewal?: number;
  currency: "USD";
  buyUrl: string;
}

/** Result of searching one registrar's website. */
export interface RegistrarSearchResult {
  registrar: string;
  hits: RegistrarSearchHit[];
  fetchTimeMs: number;
  error?: string;
}

export interface RegistrarModule {
  name: string;
  fetchPricing(): Promise<RegistrarFetchResult>;
  getPrice(tld: string): RegistrarPriceResult | null;
  buildBuyUrl(domain: string): string;
  searchDomains(query: string): Promise<RegistrarSearchResult>;
}
