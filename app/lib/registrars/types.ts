export interface RegistrarPriceResult {
  registrar: string;
  tld: string;
  registration: number;
  renewal: number;
  currency: "USD";
  source: "api" | "static";
  fetchedAt: number;
}

export interface RegistrarFetchResult {
  registrar: string;
  source: "api" | "static";
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
  source: "api" | "static";
}

export type PricingMap = Map<string, RegistrarPriceResult>;

export interface RegistrarModule {
  name: string;
  fetchPricing(): Promise<RegistrarFetchResult>;
  getPrice(tld: string): RegistrarPriceResult | null;
  buildBuyUrl(domain: string): string;
}
