import type { RegistrarModule, RegistrarSearchResult, RegistrarSearchHit } from "./types";

const NAME = "Name.com";
const API_URL = "https://api.name.com/v4/domains:checkAvailability";
const PREMIUM_PRICE_THRESHOLD = 500;

const POPULAR_TLDS = [
  "com", "net", "org", "io", "co", "ai", "app", "dev", "xyz", "me",
  "tech", "online", "site", "store", "info", "us", "club", "pro",
  "cloud", "live", "shop", "blog", "tv", "world", "art",
];

interface NamecomResult {
  domainName: string;
  purchasable?: boolean;
  premium?: boolean;
  purchasePrice?: number;
  renewalPrice?: number;
}

interface NamecomResponse {
  results?: NamecomResult[];
  message?: string;
}

function getKeyword(query: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  return q.includes(".") ? q.split(".")[0] : q;
}

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const username = process.env.NAMECOM_USERNAME;
  const token = process.env.NAMECOM_API_TOKEN;

  if (!username || !token) {
    return { registrar: NAME, hits: [], fetchTimeMs: 0, error: "NAMECOM_USERNAME or NAMECOM_API_TOKEN not set" };
  }

  const keyword = getKeyword(query);
  const domainNames = POPULAR_TLDS.map((tld) => `${keyword}.${tld}`);
  const start = Date.now();
  const auth = Buffer.from(`${username}:${token}`).toString("base64");

  console.log(`[${NAME}] API: ${domainNames.length} TLDs for "${keyword}"`);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domainNames }),
      signal: AbortSignal.timeout(25_000),
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const text = await res.text();
      console.log(`[${NAME}] HTTP ${res.status} in ${elapsed}ms`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data: NamecomResponse = await res.json();

    if (!data.results) {
      const msg = data.message ?? "No results returned";
      console.log(`[${NAME}] Empty response in ${elapsed}ms — ${msg}`);
      return { registrar: NAME, hits: [], fetchTimeMs: elapsed, error: msg };
    }

    const hits: RegistrarSearchHit[] = [];

    for (const r of data.results) {
      const domain = r.domainName.toLowerCase();
      const isAvailable = r.purchasable === true;
      const isPremium = r.premium === true;
      const registration = r.purchasePrice;
      const renewal = r.renewalPrice;

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
  return `https://www.name.com/domain/search/${encodeURIComponent(domain)}`;
}

const namecom: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default namecom;
