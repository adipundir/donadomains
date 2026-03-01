import dns from "dns";
import { promisify } from "util";

const dnsResolve = promisify(dns.resolve);

/** Registration details for taken domains (from RDAP/WHOIS at the registry). */
export interface DomainRegistrationDetails {
  registrar?: string;
  created?: string;
  expires?: string;
  registrant?: string;
  /** Contact email or other contact from registrant entity (often redacted). */
  contact?: string;
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

/** TLD without leading dot, e.g. "com" */
function tldToKey(tld: string): string {
  return tld.startsWith(".") ? tld.slice(1) : tld;
}

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_DIRECT_TIMEOUT_MS = 3000;
const RDAP_FALLBACK_TIMEOUT_MS = 5000;
const RDAP_DETAILS_TIMEOUT_MS = 8000;

let bootstrapCache: Map<string, string> | null = null;
let bootstrapPromise: Promise<Map<string, string>> | null = null;

/** Fallback RDAP bases for TLDs that may be missing from IANA bootstrap. Omit TLDs whose registry RDAP is known broken (e.g. .me rdap.nic.me does not resolve). */
const RDAP_FALLBACK_TLDS: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/",
};

async function loadBootstrap(): Promise<Map<string, string>> {
  if (bootstrapCache) return bootstrapCache;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const map = new Map<string, string>(Object.entries(RDAP_FALLBACK_TLDS));
    try {
      const res = await fetch(IANA_BOOTSTRAP_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return map;
      const data = (await res.json()) as { services?: [string[], string[]][] };
      for (const [tlds, urls] of data.services ?? []) {
        if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
        for (let i = 0; i < tlds.length; i++) {
          const tld = String(tlds[i]).toLowerCase();
          const url = urls[i] ?? urls[0];
          if (tld && url) {
            const base = url.endsWith("/") ? url : `${url}/`;
            map.set(tld, base);
          }
        }
      }
      bootstrapCache = map;
      return map;
    } catch {
      return map;
    }
  })();
  return bootstrapPromise;
}

/** Fetch RDAP for domain: try registry directly first; on failure (ENOTFOUND, timeout, etc.) retry with rdap.org. */
async function rdapFetch(domain: string, timeoutMs: number): Promise<Response> {
  const tldKey = tldToKey(extractTld(domain));
  const bootstrap = await loadBootstrap();
  const baseUrl = bootstrap.get(tldKey);
  const directUrl = baseUrl ? `${baseUrl}domain/${domain}` : null;
  const rdapOrgUrl = `https://rdap.org/domain/${domain}`;
  const tryDirect = directUrl != null;
  if (tryDirect) {
    try {
      return await fetch(directUrl, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // Registry unreachable (e.g. ENOTFOUND rdap.nic.me); fall back to rdap.org
    }
  }
  return fetch(rdapOrgUrl, { signal: AbortSignal.timeout(Math.min(timeoutMs, RDAP_FALLBACK_TIMEOUT_MS)) });
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
    const res = await rdapFetch(domain, RDAP_DIRECT_TIMEOUT_MS);
    if (res.status === 404) return { available: true, checked: true };
    if (res.ok) return { available: false, checked: true };
    return { available: false, checked: false };
  } catch {
    return { available: false, checked: false };
  }
}

async function fetchRdapDetails(domain: string): Promise<DomainRegistrationDetails | null> {
  try {
    const res = await rdapFetch(domain, RDAP_DETAILS_TIMEOUT_MS);
    if (!res.ok) {
      console.log(`[RDAP details] ${domain} → HTTP ${res.status} (not ok)`);
      return null;
    }
    const raw = (await res.json()) as Record<string, unknown>;
    console.log(`[RDAP details] ${domain} → raw keys:`, Object.keys(raw));
    if (Array.isArray(raw.events)) {
      console.log(`[RDAP details] ${domain} → events:`, JSON.stringify(raw.events, null, 2));
    } else {
      console.log(`[RDAP details] ${domain} → events:`, raw.events);
    }
    if (Array.isArray(raw.entities)) {
      console.log(`[RDAP details] ${domain} → entities (${raw.entities.length}):`, JSON.stringify(raw.entities, null, 2));
    } else {
      console.log(`[RDAP details] ${domain} → entities:`, raw.entities);
    }
    const data =
      raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
        ? (raw as { events?: Array<{ eventAction?: string; eventDate?: string }>; entities?: Array<{ role?: string[]; vcardArray?: unknown[] }>; status?: string[] })
        : raw && typeof raw === "object" && raw.domain && typeof (raw.domain as object) === "object"
          ? (raw.domain as { events?: Array<{ eventAction?: string; eventDate?: string }>; entities?: Array<{ role?: string[]; vcardArray?: unknown[] }>; status?: string[] })
          : null;
    if (!data) {
      console.log(`[RDAP details] ${domain} → no data (events not at top level or domain)`);
      return null;
    }
    const out: DomainRegistrationDetails = {};
    const events = Array.isArray(data.events) ? data.events : [];
    for (const e of events) {
      const action = (e.eventAction ?? "").toLowerCase();
      const date = e.eventDate;
      if (!date || typeof date !== "string") continue;
      if (action === "registration") out.created = date;
      else if (action === "expiration" || action === "expiry") out.expires = date;
    }
    if (Array.isArray(data.status)) out.status = data.status;
    const entities = Array.isArray(data.entities) ? data.entities : [];
    for (const ent of entities) {
      const roleRaw = ent.role;
      const roles: string[] = Array.isArray(roleRaw)
        ? roleRaw.map((r) => String(r).toLowerCase())
        : roleRaw != null
          ? [String(roleRaw).toLowerCase()]
          : [];
      const vcard = parseVcard(ent.vcardArray);
      const name = vcard.name || vcard.org || null;
      if (!name && !vcard.email) continue;
      if (roles.includes("registrar")) {
        out.registrar = name || vcard.email || undefined;
      } else if (
        roles.includes("registrant") ||
        roles.some((r) => r.includes("registrant"))
      ) {
        out.registrant = name || undefined;
        if (vcard.email) out.contact = vcard.email;
      }
    }
    const rawAny = raw as Record<string, unknown>;
    if (!out.registrar && typeof rawAny.registrar === "string") out.registrar = rawAny.registrar;
    if (!out.registrant && typeof rawAny.registrant === "string") out.registrant = rawAny.registrant;
    console.log(`[RDAP details] ${domain} → parsed:`, JSON.stringify(out, null, 2));
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    console.log(`[RDAP details] ${domain} → error:`, err);
    return null;
  }
}

/** Extract a single string from jCard value (can be string or array). */
function vcardVal(val: unknown): string | null {
  if (typeof val === "string") {
    const s = val.trim();
    return s && !/redact|privacy|data withheld|not disclosed/i.test(s) ? s : null;
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    return typeof first === "string" ? vcardVal(first) : null;
  }
  return null;
}

/** Parse jCard (vcardArray) into name, org, email. Handles various RDAP vCard shapes. */
function parseVcard(vcardArray: unknown[] | undefined): { name: string | null; org: string | null; email: string | null } {
  const out = { name: null as string | null, org: null as string | null, email: null as string | null };
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return out;
  const props = vcardArray[1];
  if (!Array.isArray(props)) return out;
  for (const p of props) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const key = String(p[0]).toLowerCase();
    const val = p.length >= 4 ? p[3] : p[2];
    const str = vcardVal(val);
    if (!str) continue;
    if (key === "fn" || key === "nickname") out.name = str;
    else if (key === "org") out.org = str;
    else if (key === "email" || key === "tel") out.email = str;
  }
  if (!out.name && out.org) out.name = out.org;
  return out;
}

function parseVcardName(vcardArray: unknown[] | undefined): string | null {
  const v = parseVcard(vcardArray);
  return v.name || v.org || v.email;
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
    const detailsResults = await Promise.all(taken.map((r) => fetchRdapDetails(r.domain)));
    detailsResults.forEach((details, i) => {
      if (details) taken[i].registration = details;
    });
    taken.forEach((r, i) => {
      console.log(`[DomainFinder] Taken domain #${i + 1} full object:\n${JSON.stringify(r, null, 2)}`);
    });
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
