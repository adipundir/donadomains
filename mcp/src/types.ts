/**
 * Type mirrors of the donadomains.xyz public API responses.
 * Kept minimal — only the fields the MCP tools surface to the LLM.
 */

export interface BuyLink {
  name: string;
  url: string;
  price?: string;
  priceNum?: number;
  isCheapest?: boolean;
  premium?: boolean;
}

export interface DomainResult {
  domain: string;
  available: boolean;
  tld: string;
  matchType?: "exact" | "similar";
  buyLinks?: BuyLink[];
  registerUrl?: string;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "failed";
  count: number;
  durationMs?: number;
  error?: string;
}

export interface SearchResponse {
  keyword: string;
  tld: string | null;
  results: DomainResult[];
  sources: SourceStatus[];
}

export interface DomainIntel {
  domain: string;
  registered: boolean;
  status?: string[];
  created?: string;
  updated?: string;
  expires?: string;
  registrar?: string;
  registrarUrl?: string;
  registrant?: string;
  organization?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  nameservers?: string[];
  dnssec?: string;
  sources: string[];
  timing: Record<string, number>;
  fetchedAt?: string;
}

export interface ValuationFactor {
  label: string;
  impact: "positive" | "negative" | "neutral";
  detail: string;
}

export interface DomainValuation {
  domain: string;
  score: number;
  tier: "common" | "decent" | "premium" | "ultra";
  estimatedValue: string;
  reasoning: string;
  factors: ValuationFactor[];
  cached?: boolean;
}
