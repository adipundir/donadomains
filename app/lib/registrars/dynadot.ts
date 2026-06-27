import type { RegistrarModule, RegistrarSearchResult, RegistrarSearchHit } from "./types";

const NAME = "Dynadot";
const API_URL = "https://api.dynadot.com/api3.json";
const PREMIUM_PRICE_THRESHOLD = 500;

const POPULAR_TLDS = [
  "com", "net", "org", "io", "co", "ai", "app", "dev", "xyz", "me",
  "tech", "online", "site", "store", "info", "us", "club", "pro",
  "cloud", "live", "shop", "blog", "tv", "world", "art",
];

interface DynadotHit {
  DomainName: string;
  Available: string;
  Price?: string | null;
  RenewalPrice?: string | null;
  PremiumName?: string;
}

interface DynadotResponse {
  SearchResponse?: {
    ResponseCode?: number;
    Status?: string;
    Error?: string;
    SearchResults?: DynadotHit[];
  };
}

function getKeyword(query: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  return q.includes(".") ? q.split(".")[0] : q;
}

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const apiKey = process.env.DYNADOT_API_KEY;
  if (!apiKey) {
    return { registrar: NAME, hits: [], fetchTimeMs: 0, error: "DYNADOT_API_KEY not set" };
  }

  const keyword = getKeyword(query);
  const domains = POPULAR_TLDS.map((tld) => `${keyword}.${tld}`);
  const start = Date.now();

  const domainParams = domains.map((d, i) => `domain${i}=${encodeURIComponent(d)}`).join("&");
  const url = `${API_URL}?key=${encodeURIComponent(apiKey)}&command=search&show_price=1&${domainParams}`;

  console.log(`[${NAME}] API: ${domains.length} TLDs for "${keyword}"`);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const text = await res.text();
      console.log(`[${NAME}] HTTP ${res.status} in ${elapsed}ms`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data: DynadotResponse = await res.json();
    const sr = data.SearchResponse;

    if (!sr || sr.ResponseCode !== 0) {
      const msg = sr?.Error ?? sr?.Status ?? "Unknown API error";
      console.log(`[${NAME}] API error in ${elapsed}ms — ${msg}`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: msg };
    }

    const hits: RegistrarSearchHit[] = [];

    for (const r of sr.SearchResults ?? []) {
      const domain = r.DomainName.toLowerCase();
      const isAvailable = r.Available === "yes";
      const isPremium = r.PremiumName === "yes";
      const registration = r.Price ? parseFloat(r.Price) : undefined;
      const renewal = r.RenewalPrice ? parseFloat(r.RenewalPrice) : undefined;

      const effectivelyPremium =
        isPremium || (registration != null && registration >= PREMIUM_PRICE_THRESHOLD);

      hits.push({
        domain,
        available: isAvailable && !effectivelyPremium,
        explicitlyTaken: !isAvailable && !effectivelyPremium ? true : undefined,
        premium: effectivelyPremium || undefined,
        registration,
        renewal,
        currency: "USD",
        buyUrl: buildBuyUrl(domain),
      });
    }

    const avail = hits.filter((h) => h.available).length;
    const taken = hits.filter((h) => !h.available && !h.premium).length;
    const premium = hits.filter((h) => h.premium).length;
    console.log(`[${NAME}] ${hits.length} results in ${elapsed}ms — ${avail} avail, ${taken} taken, ${premium} premium`);

    return { registrar: NAME, hits, fetchTimeMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`[${NAME}] EXCEPTION in ${elapsed}ms — ${(err as Error).message}`);
    return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: (err as Error).message };
  }
}

function buildBuyUrl(domain: string): string {
  return `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(domain)}`;
}

const dynadot: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default dynadot;
