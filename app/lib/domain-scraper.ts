import dns from "dns";
import { promisify } from "util";

const dnsResolve = promisify(dns.resolve);

/** Registration details for taken domains (from RDAP/WHOIS at the registry). */
export interface DomainRegistrationDetails {
  registrar?: string;
  created?: string;
  expires?: string;
  registrant?: string;
  status?: string[];
}

/** Link to a registrar where the user can buy/register the domain */
export interface BuyLink {
  name: string;
  url: string;
}

export interface DomainResult {
  domain: string;
  available: boolean;
  price?: string;
  tld: string;
  source?: string;
  type?: "expired" | "auction";
  /** "exact" = keyword + TLD; "similar" = variants (e.g. keyword+online, my+keyword) */
  matchType?: "exact" | "similar";
  sourceUrl?: string;
  buyLinks?: BuyLink[];
  registerUrl?: string;
  registration?: DomainRegistrationDetails;
}

/** Per-source fetch status for transparency in the UI */
export interface SourceStatus {
  name: string;
  status: "ok" | "failed";
  count: number;
  error?: string;
}

// Order for display: exact/primary TLDs first (.com, .net, …), then rest.
const COMMON_TLDS = [".com", ".net", ".org", ".io", ".co", ".dev", ".app", ".ai", ".xyz", ".me", ".info", ".biz", ".us", ".tv", ".online", ".site", ".tech", ".store", ".club", ".world"];
const TLD_ORDER: Record<string, number> = Object.fromEntries(COMMON_TLDS.map((tld, i) => [tld, i]));
function tldSortKey(tld: string): number {
  return TLD_ORDER[tld] ?? 999;
}

/** If user typed "adipundir.com", return base name "adipundir" and user TLD ".com". Otherwise just sanitize. */
function parseKeyword(keyword: string): { baseName: string; userTld?: string } {
  const lower = keyword.toLowerCase().trim();
  for (const tld of COMMON_TLDS) {
    if (lower.endsWith(tld)) {
      const namePart = lower.slice(0, -tld.length).replace(/[^a-z0-9-]/g, "");
      if (namePart.length > 0) return { baseName: namePart, userTld: tld };
      break;
    }
  }
  return { baseName: lower.replace(/[^a-z0-9-]/g, "") };
}

/** Similar-name variants: suffix/prefix combos we check with .com, .net, .org only */
const SIMILAR_SUFFIXES = ["online", "hub", "app", "io", "hq"];
const SIMILAR_PREFIXES = ["my", "get", "the", "go"];
const SIMILAR_TLDS = [".com", ".net", ".org"];

function getBuyLinksForDomain(domain: string): BuyLink[] {
  const enc = encodeURIComponent(domain);
  return [
    { name: "GoDaddy", url: `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${enc}` },
    { name: "Namecheap", url: `https://www.namecheap.com/domains/registration/results/?domain=${enc}` },
    { name: "Squarespace", url: `https://www.squarespace.com/domains?domain=${enc}` },
    { name: "Cloudflare", url: `https://www.cloudflare.com/products/registrar/?domain=${enc}` },
    { name: "Porkbun", url: `https://porkbun.com/checkout/search?q=${enc}` },
  ];
}

function extractTld(domain: string): string {
  const parts = domain.split(".");
  return parts.length > 1 ? `.${parts.slice(1).join(".")}` : "";
}

async function checkDnsAvailability(domain: string): Promise<boolean> {
  try {
    await dnsResolve(domain);
    return false;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return true;
    return false;
  }
}

async function checkRdapAvailability(domain: string): Promise<{ available: boolean; checked: boolean }> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return { available: true, checked: true };
    if (res.ok) return { available: false, checked: true };
    return { available: false, checked: false };
  } catch {
    return { available: false, checked: false };
  }
}

async function fetchRdapDetails(domain: string): Promise<DomainRegistrationDetails | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      entities?: Array<{ role?: string[]; vcardArray?: unknown[] }>;
      status?: string[];
    };
    const out: DomainRegistrationDetails = {};
    if (Array.isArray(data.events)) {
      for (const e of data.events) {
        const action = (e.eventAction ?? "").toLowerCase();
        const date = e.eventDate;
        if (!date) continue;
        if (action === "registration") out.created = date;
        else if (action === "expiration") out.expires = date;
      }
    }
    if (Array.isArray(data.status)) out.status = data.status;
    if (Array.isArray(data.entities)) {
      for (const ent of data.entities) {
        const roles = (ent.role ?? []).map((r) => String(r).toLowerCase());
        const name = parseVcardName(ent.vcardArray);
        if (roles.includes("registrar") && name) out.registrar = name;
        else if ((roles.includes("registrant") || roles.includes("registrant contact")) && name) out.registrant = name;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function parseVcardName(vcardArray: unknown[] | undefined): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const props = vcardArray[1];
  if (!Array.isArray(props)) return null;
  for (const p of props) {
    if (!Array.isArray(p) || p.length < 4) continue;
    const key = String(p[0]).toLowerCase();
    const val = p[3];
    if ((key === "fn" || key === "org") && typeof val === "string" && val && !/redact|privacy|data withheld/i.test(val)) {
      return val.trim();
    }
  }
  return null;
}

async function checkOneDomain(
  domain: string,
  source: string,
  sourceUrl: string,
  matchType: "exact" | "similar"
): Promise<DomainResult> {
  const dnsAvailable = await checkDnsAvailability(domain);
  let available = false;
  if (dnsAvailable) {
    const rdap = await checkRdapAvailability(domain);
    available = rdap.checked ? rdap.available : dnsAvailable;
  }
  const buyLinks = getBuyLinksForDomain(domain);
  return {
    domain,
    available,
    tld: extractTld(domain),
    source,
    sourceUrl,
    matchType,
    buyLinks,
    registerUrl: buyLinks[0]?.url,
  };
}

async function searchRegistry(keyword: string): Promise<{ results: DomainResult[]; userTld?: string }> {
  const startTime = Date.now();
  const source = "Registry (RDAP/DNS)";
  const { baseName, userTld } = parseKeyword(keyword);
  console.log(`[${source}] Starting availability check for: "${keyword}" (base: "${baseName}"${userTld ? `, user TLD: ${userTld}` : ""})`);

  if (!baseName) return { results: [] };

  const exactDomains = COMMON_TLDS.map((tld) => ({ domain: `${baseName}${tld}`, matchType: "exact" as const }));
  const exactSet = new Set(exactDomains.map((d) => d.domain));

  const similarDomains: { domain: string; matchType: "similar" }[] = [];
  for (const suffix of SIMILAR_SUFFIXES) {
    const name = baseName + suffix;
    for (const tld of SIMILAR_TLDS) {
      const d = name + tld;
      if (!exactSet.has(d)) similarDomains.push({ domain: d, matchType: "similar" });
    }
  }
  for (const prefix of SIMILAR_PREFIXES) {
    const name = prefix + baseName;
    for (const tld of SIMILAR_TLDS) {
      const d = name + tld;
      if (!exactSet.has(d)) similarDomains.push({ domain: d, matchType: "similar" });
    }
  }

  const toCheck = [...exactDomains, ...similarDomains];
  const sourceUrl = "https://rdap.org";
  const results = await Promise.all(
    toCheck.map(({ domain, matchType }) => checkOneDomain(domain, source, sourceUrl, matchType))
  );

  const elapsed = Date.now() - startTime;
  const availableCount = results.filter((r) => r.available).length;
  console.log(`[${source}] Completed in ${elapsed}ms. Checked ${results.length} domains (${exactDomains.length} exact, ${similarDomains.length} similar), ${availableCount} available.`);
  return { results, userTld };
}

export interface SearchDomainsMultiSourceResult {
  results: DomainResult[];
  sourceStatuses: SourceStatus[];
}

export async function searchDomainsMultiSource(keyword: string): Promise<SearchDomainsMultiSourceResult> {
  console.log(`\n[DomainFinder] ========== FETCH START (keyword: "${keyword}") ==========`);
  const startTime = Date.now();

  const { results: list, userTld } = await searchRegistry(keyword);
  const sourceStatuses: SourceStatus[] = [{ name: "Registry (RDAP/DNS)", status: "ok", count: list.length }];

  // Sort: available first, then taken; then exact before similar; then user's TLD first if provided, then .com, .net, …
  list.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    const exactA = a.matchType === "exact" ? 0 : 1;
    const exactB = b.matchType === "exact" ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    if (userTld) {
      if (a.tld === userTld && b.tld !== userTld) return -1;
      if (a.tld !== userTld && b.tld === userTld) return 1;
    }
    return tldSortKey(a.tld) - tldSortKey(b.tld);
  });

  const taken = list.filter((r) => !r.available);
  if (taken.length > 0) {
    console.log(`[DomainFinder] Fetching registration details for ${taken.length} taken domain(s) via RDAP...`);
    for (let i = 0; i < taken.length; i++) {
      const details = await fetchRdapDetails(taken[i].domain);
      if (details) taken[i].registration = details;
      if (i < taken.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const elapsed = Date.now() - startTime;
  const availableCount = list.filter((r) => r.available).length;
  console.log(`[DomainFinder] ========== COMPLETE in ${elapsed}ms. Total: ${list.length} unique, ${availableCount} available ==========\n`);
  return { results: list, sourceStatuses };
}

export async function searchDomains(keyword: string): Promise<DomainResult[]> {
  const { results } = await searchDomainsMultiSource(keyword);
  return results;
}
