/**
 * Fast, scalable domain registrar pricing — NO browser automation.
 *
 * Strategy:
 * - Porkbun:     Live public API (898 TLDs, cached after first call)
 * - Cloudflare:  Static at-cost pricing (they sell at ICANN wholesale, very stable)
 * - GoDaddy:     Static first-year pricing table (updated periodically)
 * - Namecheap:   Official API when creds set, otherwise static pricing table
 * - Squarespace: Static pricing table
 *
 * All fetches run in parallel. Total enrichment time: ~1-3s (vs 250s+ with Playwright).
 */

export interface RegistrarPrice {
  name: string;
  url: string;
  price: string;
  priceNum: number;
  isCheapest?: boolean;
  source: "api" | "static";
}

// ─── Porkbun: Live API + static fallback ────────────────────────────────────

const PORKBUN_TIMEOUT_MS = 35_000;
type PorkbunCache = Record<string, { registration: number; renewal: number }>;
let porkbunCache: PorkbunCache | null = null;
let porkbunPromise: Promise<PorkbunCache | null> | null = null;

const PORKBUN_STATIC: Record<string, number> = {
  com: 11.08, net: 9.99, org: 6.88, io: 28.12, co: 9.58,
  dev: 10.81, app: 10.81, ai: 72.40, xyz: 2.04, me: 3.94,
  info: 2.89, biz: 7.99, us: 5.39, tv: 28.58, online: 1.28,
  site: 1.28, tech: 2.98, store: 1.28, club: 2.96, world: 2.28,
};

async function loadPorkbunPricing(): Promise<PorkbunCache | null> {
  if (porkbunCache) {
    console.log("[Pricing][Porkbun] Using cached data, TLDs:", Object.keys(porkbunCache).length);
    return porkbunCache;
  }
  if (porkbunPromise) return porkbunPromise;

  porkbunPromise = (async () => {
    const start = Date.now();
    console.log("[Pricing][Porkbun] Fetching from API...");
    try {
      const res = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(PORKBUN_TIMEOUT_MS),
      });
      const elapsed = Date.now() - start;
      console.log(`[Pricing][Porkbun] API response: status=${res.status}, time=${elapsed}ms`);
      if (!res.ok) {
        console.log(`[Pricing][Porkbun] API FAILED: HTTP ${res.status}, body=${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as {
        status?: string;
        pricing?: Record<string, { registration?: string; renewal?: string }>;
      };
      if (data.status !== "SUCCESS" || !data.pricing) {
        console.log(`[Pricing][Porkbun] API returned invalid data: status=${data.status}, hasPricing=${!!data.pricing}`);
        return null;
      }

      const cache: Record<string, { registration: number; renewal: number }> = {};
      for (const [tld, info] of Object.entries(data.pricing)) {
        const reg = parseFloat(String(info?.registration ?? "").replace(/,/g, ""));
        const renew = parseFloat(String(info?.renewal ?? "").replace(/,/g, ""));
        if (!isNaN(reg) && reg > 0) {
          cache[tld.toLowerCase()] = { registration: reg, renewal: isNaN(renew) ? reg : renew };
        }
      }
      const sample = [".com", ".net", ".org", ".xyz"].map((t) => {
        const p = cache[t.replace(".", "")];
        return p ? `${t}=$${p.registration}` : null;
      }).filter(Boolean).join(", ");
      console.log(`[Pricing][Porkbun] API SUCCESS: ${Object.keys(cache).length} TLDs. Sample: ${sample}`);
      porkbunCache = cache;
      return cache;
    } catch (err) {
      console.log(`[Pricing][Porkbun] API ERROR: ${(err as Error).message} (using static fallback)`);
      return null;
    }
  })();
  return porkbunPromise;
}

function getPorkbunPrice(tld: string): { price: number; source: "api" | "static" } | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  const entry = porkbunCache?.[key];
  if (entry) return { price: entry.registration, source: "api" };
  if (PORKBUN_STATIC[key] != null) return { price: PORKBUN_STATIC[key], source: "static" };
  return null;
}

// ─── Namecheap: Official API (when credentials set) ─────────────────────────

const NAMECHEAP_TIMEOUT_MS = 8_000;
type NamecheapCache = Record<string, number>;
let namecheapCache: NamecheapCache | null = null;
let namecheapPromise: Promise<NamecheapCache | null> | null = null;

async function loadNamecheapPricing(): Promise<NamecheapCache | null> {
  const user = process.env.NAMECHEAP_API_USER;
  const key = process.env.NAMECHEAP_API_KEY;
  const clientIp = process.env.NAMECHEAP_API_IP;
  if (!user || !key || !clientIp) {
    console.log("[Pricing][Namecheap] SKIPPED: no API credentials (NAMECHEAP_API_USER/KEY/IP). Using static table.");
    return null;
  }

  if (namecheapCache) {
    console.log("[Pricing][Namecheap] Using cached data, TLDs:", Object.keys(namecheapCache).length);
    return namecheapCache;
  }
  if (namecheapPromise) return namecheapPromise;

  namecheapPromise = (async () => {
    const start = Date.now();
    console.log("[Pricing][Namecheap] Fetching from API...");
    try {
      const params = new URLSearchParams({
        ApiUser: user,
        ApiKey: key,
        UserName: user,
        ClientIP: clientIp,
        Command: "namecheap.users.getPricing",
        ProductType: "DOMAIN",
      });
      const res = await fetch(`https://api.namecheap.com/xml.response?${params}`, {
        signal: AbortSignal.timeout(NAMECHEAP_TIMEOUT_MS),
      });
      const elapsed = Date.now() - start;
      console.log(`[Pricing][Namecheap] API response: status=${res.status}, time=${elapsed}ms`);
      if (!res.ok) {
        console.log(`[Pricing][Namecheap] API FAILED: HTTP ${res.status}`);
        return null;
      }
      const text = await res.text();
      const cache: Record<string, number> = {};
      const blocks = text.split(/<Product\s+Name="/gi);
      for (let i = 1; i < blocks.length; i++) {
        const nameMatch = blocks[i].match(/^([a-z0-9.]+)"/i);
        const priceMatch = blocks[i].match(/<Price\s+[^>]*Duration="1"[^>]*Price="([^"]+)"/);
        if (nameMatch && priceMatch) {
          const tld = nameMatch[1].toLowerCase();
          const price = parseFloat(priceMatch[1].replace(/,/g, ""));
          if (!isNaN(price)) cache[tld] = price;
        }
      }
      const sample = [".com", ".net", ".org"].map((t) => {
        const p = cache[t.replace(".", "")];
        return p ? `${t}=$${p}` : null;
      }).filter(Boolean).join(", ");
      console.log(`[Pricing][Namecheap] API SUCCESS: ${Object.keys(cache).length} TLDs. Sample: ${sample}`);
      namecheapCache = cache;
      return cache;
    } catch (err) {
      console.log(`[Pricing][Namecheap] API ERROR: ${(err as Error).message} (using static table)`);
      return null;
    }
  })();
  return namecheapPromise;
}

// ─── Namecheap: Static fallback pricing (first-year registration, USD) ──────

const NAMECHEAP_STATIC: Record<string, number> = {
  com: 9.58, net: 12.98, org: 9.48, io: 25.88, co: 11.98,
  dev: 12.98, app: 14.98, ai: 69.98, xyz: 1.98, me: 5.98,
  info: 4.98, biz: 12.98, us: 5.98, tv: 37.98, online: 2.98,
  site: 2.98, tech: 4.98, store: 2.98, club: 4.98, world: 5.98,
};

function getNamecheapPrice(tld: string): { price: number; source: "api" | "static" } | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  if (namecheapCache?.[key] != null) {
    return { price: namecheapCache[key], source: "api" };
  }
  if (NAMECHEAP_STATIC[key] != null) {
    return { price: NAMECHEAP_STATIC[key], source: "static" };
  }
  return null;
}

// ─── Cloudflare: At-cost pricing (ICANN wholesale + small margin, very stable) ─

const CLOUDFLARE_PRICES: Record<string, number> = {
  com: 9.15, net: 9.77, org: 9.93, io: 33.98, co: 11.69,
  dev: 12.00, app: 14.00, ai: 24.69, xyz: 9.08, me: 6.38,
  info: 9.08, biz: 9.08, us: 6.50, tv: 30.00, online: 2.98,
  site: 2.98, tech: 4.98, store: 2.98, club: 4.98, world: 6.98,
};

function getCloudflarePrice(tld: string): { price: number; source: "static" } | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return CLOUDFLARE_PRICES[key] != null ? { price: CLOUDFLARE_PRICES[key], source: "static" } : null;
}

// ─── GoDaddy: Static first-year promotional pricing (USD) ───────────────────

const GODADDY_PRICES: Record<string, number> = {
  com: 11.99, net: 14.99, org: 9.99, io: 49.99, co: 11.99,
  dev: 15.99, app: 19.99, ai: 79.99, xyz: 3.99, me: 9.99,
  info: 3.99, biz: 14.99, us: 5.99, tv: 39.99, online: 2.99,
  site: 2.99, tech: 5.99, store: 2.99, club: 3.99, world: 3.99,
};

function getGoDaddyPrice(tld: string): { price: number; source: "static" } | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return GODADDY_PRICES[key] != null ? { price: GODADDY_PRICES[key], source: "static" } : null;
}

// ─── Squarespace: Static pricing (USD, with annual plan) ────────────────────

const SQUARESPACE_PRICES: Record<string, number> = {
  com: 12.00, net: 20.00, org: 20.00, io: 36.00, co: 30.00,
  dev: 16.00, app: 18.00, ai: 80.00, xyz: 15.00, me: 20.00,
  info: 14.00, us: 12.00, tv: 40.00, online: 6.00,
  site: 6.00, tech: 8.00,
};

function getSquarespacePrice(tld: string): { price: number; source: "static" } | null {
  const key = tld.replace(/^\./, "").toLowerCase();
  return SQUARESPACE_PRICES[key] != null ? { price: SQUARESPACE_PRICES[key], source: "static" } : null;
}

// ─── Public API: Get all registrar prices for a domain ──────────────────────

function buildBuyUrl(registrar: string, domain: string): string {
  const enc = encodeURIComponent(domain);
  switch (registrar) {
    case "GoDaddy":
      return `https://www.godaddy.com/domainsearch/find?domainToCheck=${enc}`;
    case "Namecheap":
      return `https://www.namecheap.com/domains/registration/results/?domain=${enc}`;
    case "Cloudflare":
      return `https://domains.cloudflare.com/?domain=${enc}`;
    case "Porkbun":
      return `https://porkbun.com/checkout/search?q=${enc}`;
    case "Squarespace":
      return `https://www.squarespace.com/domains?domain=${enc}`;
    default:
      return "";
  }
}

export interface BuyLinkWithPricing {
  name: string;
  url: string;
  price?: string;
  priceNum?: number;
  isCheapest?: boolean;
}

/**
 * Preload all pricing data in parallel. Call once before enriching domains.
 * Porkbun API loads in background (non-blocking) — static fallback used until ready.
 * Namecheap API awaited (fast when creds set).
 */
export async function preloadPricing(): Promise<void> {
  console.log("[Pricing] Preloading... (Porkbun=API, Namecheap=API if creds else static, Cloudflare/GoDaddy/Squarespace=static table)");
  loadPorkbunPricing().catch(() => {});
  await loadNamecheapPricing().catch(() => {});
  console.log("[Pricing] Preload complete. Porkbun:", porkbunCache ? "API" : "static fallback | Namecheap:", namecheapCache ? "API" : "static table");
}

/** Log pricing sources for a domain (for debugging). */
function logPricingForDomain(domain: string, links: BuyLinkWithPricing[]): void {
  const parts = links.map((l) => {
    if (!l.priceNum) return `${l.name}=MISSING`;
    const src = l.name === "Porkbun" ? (porkbunCache ? "API" : "static") :
      l.name === "Namecheap" ? (namecheapCache ? "API" : "static") : "static";
    return `${l.name}=$${l.priceNum}(${src})`;
  });
  console.log(`[Pricing][${domain}] ${parts.join(" | ")}`);
}

/**
 * Get buy links with pricing for a domain. Instant after preloadPricing() is done.
 * Returns links for: GoDaddy, Namecheap, Cloudflare, Porkbun, Squarespace.
 */
export function getBuyLinksWithPricing(domain: string, logSources = false): BuyLinkWithPricing[] {
  const tld = domain.includes(".") ? domain.split(".").slice(1).join(".") : "";
  if (!tld) return [];

  const registrars: { name: string; getPrice: (tld: string) => { price: number; source: string } | null }[] = [
    { name: "Cloudflare", getPrice: getCloudflarePrice },
    { name: "Porkbun", getPrice: getPorkbunPrice },
    { name: "Namecheap", getPrice: getNamecheapPrice },
    { name: "GoDaddy", getPrice: getGoDaddyPrice },
    { name: "Squarespace", getPrice: getSquarespacePrice },
  ];

  const links: BuyLinkWithPricing[] = [];
  for (const reg of registrars) {
    const priceData = reg.getPrice(tld);
    const link: BuyLinkWithPricing = {
      name: reg.name,
      url: buildBuyUrl(reg.name, domain),
    };
    if (priceData) {
      link.price = `$${priceData.price.toFixed(2)}/yr`;
      link.priceNum = priceData.price;
    }
    links.push(link);
  }

  const withPrice = links.filter((l) => l.priceNum != null);
  if (withPrice.length > 0) {
    const minPrice = Math.min(...withPrice.map((l) => l.priceNum!));
    for (const l of withPrice) {
      if (l.priceNum === minPrice) l.isCheapest = true;
    }
  }

  if (logSources) logPricingForDomain(domain, links);
  return links;
}
