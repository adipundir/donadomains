import dns from "dns";
import { promisify } from "util";
import { preloadAllPricing, getBuyLinks } from "./registrars";
import type { BuyLink } from "./registrars";

const dnsResolve = promisify(dns.resolve);

export interface DomainRegistrationDetails {
  registrar?: string;
  created?: string;
  expires?: string;
  registrant?: string;
  contact?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  status?: string[];
}

export type { BuyLink };

export interface DomainResult {
  domain: string;
  available: boolean;
  price?: string;
  tld: string;
  source?: string;
  type?: "expired" | "auction";
  matchType?: "exact" | "similar";
  sourceUrl?: string;
  buyLinks?: BuyLink[];
  registerUrl?: string;
  registration?: DomainRegistrationDetails;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "failed";
  count: number;
  error?: string;
}

const COMMON_TLDS = [".com", ".net", ".org", ".io", ".co", ".dev", ".app", ".ai", ".xyz", ".me", ".info", ".biz", ".us", ".tv", ".online", ".site", ".tech", ".store", ".club", ".world"];
const TLD_ORDER: Record<string, number> = Object.fromEntries(COMMON_TLDS.map((tld, i) => [tld, i]));
function tldSortKey(tld: string): number {
  return TLD_ORDER[tld] ?? 999;
}

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

const SIMILAR_SUFFIXES = ["online", "hub", "app", "io", "hq"];
const SIMILAR_PREFIXES = ["my", "get", "the", "go"];
const SIMILAR_TLDS = [".com", ".net", ".org"];

// ─── RDAP Bootstrap ─────────────────────────────────────────────────────────

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_DIRECT_TIMEOUT_MS = 3000;
const RDAP_FALLBACK_TIMEOUT_MS = 5000;
const RDAP_DETAILS_TIMEOUT_MS = 8000;

let bootstrapCache: Map<string, string> | null = null;
let bootstrapPromise: Promise<Map<string, string>> | null = null;

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
            map.set(tld, url.endsWith("/") ? url : `${url}/`);
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

function extractTld(domain: string): string {
  const parts = domain.split(".");
  return parts.length > 1 ? `.${parts.slice(1).join(".")}` : "";
}

function tldToKey(tld: string): string {
  return tld.startsWith(".") ? tld.slice(1) : tld;
}

const LOG_RDAP = process.env.LOG_RDAP === "1";

async function rdapFetch(domain: string, timeoutMs: number): Promise<Response> {
  const tldKey = tldToKey(extractTld(domain));
  const bootstrap = await loadBootstrap();
  const baseUrl = bootstrap.get(tldKey);
  const directUrl = baseUrl ? `${baseUrl}domain/${domain}` : null;
  const rdapOrgUrl = `https://rdap.org/domain/${domain}`;
  if (directUrl) {
    try {
      const res = await fetch(directUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (LOG_RDAP) console.log(`[RDAP][${domain}] registry → ${res.status}`);
      return res;
    } catch (err) {
      if (LOG_RDAP) console.log(`[RDAP][${domain}] registry ERROR → ${(err as Error).message}`);
    }
  }
  return fetch(rdapOrgUrl, { signal: AbortSignal.timeout(Math.min(timeoutMs, RDAP_FALLBACK_TIMEOUT_MS)) });
}

// ─── DNS / RDAP Availability ────────────────────────────────────────────────

async function checkDnsAvailability(domain: string): Promise<boolean | null> {
  try {
    await dnsResolve(domain);
    return false;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return true;
    return null;
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

// ─── RDAP Registration Details ──────────────────────────────────────────────

type RdapEntity = {
  role?: string | string[];
  roles?: string | string[];
  vcardArray?: unknown[];
  handle?: string;
  entities?: RdapEntity[];
};

function flattenEntities(entities: RdapEntity[] | undefined): RdapEntity[] {
  const out: RdapEntity[] = [];
  if (!Array.isArray(entities)) return out;
  for (const ent of entities) {
    out.push(ent);
    if (Array.isArray(ent.entities)) out.push(...flattenEntities(ent.entities));
  }
  return out;
}

function buildContactString(v: { email?: string | null; tel?: string | null; adr?: string | null }): string | undefined {
  const parts: string[] = [];
  if (v.email) parts.push(v.email);
  if (v.tel) parts.push(v.tel);
  if (v.adr) parts.push(v.adr);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function fetchRdapDetails(domain: string): Promise<DomainRegistrationDetails | null> {
  try {
    const res = await rdapFetch(domain, RDAP_DETAILS_TIMEOUT_MS);
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    type RdapData = { events?: Array<{ eventAction?: string; eventDate?: string }>; entities?: RdapEntity[]; status?: string[] };
    const rawCast = raw as { events?: unknown; domain?: RdapData; entities?: unknown; ldhName?: string };
    const data: RdapData | null =
      raw && typeof raw === "object" && Array.isArray(rawCast.events)
        ? (raw as RdapData)
        : raw && typeof raw === "object" && rawCast.domain && typeof rawCast.domain === "object"
          ? rawCast.domain
          : raw && typeof raw === "object" && (rawCast.ldhName || rawCast.entities) && (Array.isArray(rawCast.events) || Array.isArray(rawCast.entities))
            ? (raw as RdapData)
            : null;
    if (!data) return null;

    const out: DomainRegistrationDetails = {};
    const events = Array.isArray(data.events) ? data.events : [];
    for (const e of events) {
      const action = String((e as { eventAction?: string }).eventAction ?? "").toLowerCase();
      const date = (e as { eventDate?: string }).eventDate;
      if (!date || typeof date !== "string") continue;
      if (action === "registration") out.created = date;
      else if (action === "expiration" || action === "expiry" || action === "expires") out.expires = date;
    }
    if (Array.isArray(data.status)) out.status = data.status;

    const allEntities = flattenEntities(data.entities);
    for (const ent of allEntities) {
      const roleRaw = ent.roles ?? ent.role;
      const roles: string[] = Array.isArray(roleRaw) ? roleRaw.map((r) => String(r).toLowerCase()) : roleRaw != null ? [String(roleRaw).toLowerCase()] : [];
      const vcard = parseVcard(ent.vcardArray);
      const name = vcard.name || vcard.org || null;
      const display = name || vcard.email || vcard.tel || null;
      if (roles.includes("registrar")) {
        if (!out.registrar) out.registrar = display || ent.handle || undefined;
      } else if (roles.includes("registrant") || roles.some((r) => r.includes("registrant"))) {
        if (!out.registrant) out.registrant = name || undefined;
        if (!out.contact && (vcard.email || vcard.tel || vcard.adr)) {
          out.contactEmail = vcard.email || undefined;
          out.contactPhone = vcard.tel || undefined;
          out.contactAddress = vcard.adr || undefined;
          out.contact = buildContactString(vcard);
        }
      }
    }
    if (!out.contact) {
      for (const role of ["administrative", "technical", "billing", "abuse"]) {
        const ent = allEntities.find((e) => {
          const r = e.roles ?? e.role;
          const rs = Array.isArray(r) ? r.map((x) => String(x).toLowerCase()) : r != null ? [String(r).toLowerCase()] : [];
          return rs.includes(role) || rs.some((x) => x.includes(role));
        });
        if (ent) {
          const vcard = parseVcard(ent.vcardArray);
          if (vcard.email || vcard.tel || vcard.adr) {
            out.contactEmail = vcard.email || undefined;
            out.contactPhone = vcard.tel || undefined;
            out.contactAddress = vcard.adr || undefined;
            out.contact = buildContactString(vcard);
            break;
          }
        }
      }
    }
    const rawAny = raw as Record<string, unknown>;
    if (!out.registrar && typeof rawAny.registrar === "string") out.registrar = rawAny.registrar;
    if (!out.registrant && typeof rawAny.registrant === "string") out.registrant = rawAny.registrant;

    if (process.env.LOG_RDAP !== "0") {
      console.log(`[RDAP][${domain}] registration: registrar=${out.registrar ?? "—"} registrant=${out.registrant ?? "—"} created=${out.created ?? "—"} expires=${out.expires ?? "—"}`);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    if (process.env.LOG_RDAP !== "0") console.log(`[RDAP][${domain}] ERROR: ${(err as Error).message}`);
    return null;
  }
}

// ─── vCard Parsing ──────────────────────────────────────────────────────────

function vcardVal(val: unknown): string | null {
  if (typeof val === "string") {
    const s = val.trim();
    return s && !/redact|privacy|data withheld|not disclosed|^$/.test(s) ? s : null;
  }
  if (Array.isArray(val) && val.length > 0) return typeof val[0] === "string" ? vcardVal(val[0]) : null;
  return null;
}

function parseVcard(vcardArray: unknown[] | undefined): {
  name: string | null; org: string | null; email: string | null; tel: string | null; adr: string | null;
} {
  const out = { name: null as string | null, org: null as string | null, email: null as string | null, tel: null as string | null, adr: null as string | null };
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return out;
  const props = vcardArray[1];
  if (!Array.isArray(props)) return out;
  for (const p of props) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const key = String(p[0]).toLowerCase();
    const val = p.length >= 4 ? p[3] : p[2];
    if (key === "adr") {
      const adrArr = Array.isArray(val) ? val : val != null ? [val] : [];
      const parts = adrArr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim()).filter((s) => !/redact|privacy|withheld/i.test(s));
      if (parts.length > 0) out.adr = parts.join(", ");
      continue;
    }
    const str = vcardVal(val);
    if (!str) continue;
    if (key === "fn" || key === "nickname") out.name = str;
    else if (key === "org") out.org = str;
    else if (key === "email") out.email = str;
    else if (key === "tel") out.tel = formatTel(str);
  }
  if (!out.name && out.org) out.name = out.org;
  return out;
}

function formatTel(tel: string): string {
  const cleaned = tel.replace(/^tel:/i, "").replace(/\D/g, "");
  if (cleaned.length >= 10) {
    const m = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  }
  return tel;
}

// ─── Domain Check ───────────────────────────────────────────────────────────

async function checkOneDomain(
  domain: string,
  source: string,
  sourceUrl: string,
  matchType: "exact" | "similar"
): Promise<DomainResult> {
  const dnsResult = await checkDnsAvailability(domain);
  let available = false;
  if (dnsResult === false) {
    available = false;
  } else {
    const rdap = await checkRdapAvailability(domain);
    if (rdap.checked) {
      available = rdap.available;
    } else {
      available = dnsResult === true;
    }
  }
  const buyLinks = getBuyLinks(domain);
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

// ─── Search ─────────────────────────────────────────────────────────────────

async function searchRegistry(keyword: string): Promise<{ results: DomainResult[]; userTld?: string }> {
  const startTime = Date.now();
  const source = "Registry (RDAP/DNS)";
  const { baseName, userTld } = parseKeyword(keyword);
  console.log(`[Registry] Parsed keyword: baseName="${baseName}"${userTld ? ` userTld=${userTld}` : ""}`);
  if (!baseName) return { results: [] };

  const exactDomains = COMMON_TLDS.map((tld) => ({ domain: `${baseName}${tld}`, matchType: "exact" as const }));
  const exactSet = new Set(exactDomains.map((d) => d.domain));

  const similarDomains: { domain: string; matchType: "similar" }[] = [];
  for (const suffix of SIMILAR_SUFFIXES) {
    for (const tld of SIMILAR_TLDS) {
      const d = baseName + suffix + tld;
      if (!exactSet.has(d)) similarDomains.push({ domain: d, matchType: "similar" });
    }
  }
  for (const prefix of SIMILAR_PREFIXES) {
    for (const tld of SIMILAR_TLDS) {
      const d = prefix + baseName + tld;
      if (!exactSet.has(d)) similarDomains.push({ domain: d, matchType: "similar" });
    }
  }

  const toCheck = [...exactDomains, ...similarDomains];
  console.log(`[Registry] Checking ${toCheck.length} domains (${exactDomains.length} exact, ${similarDomains.length} similar)`);
  const sourceUrl = "https://rdap.org";

  // Fetch registrar pricing in parallel with domain availability checks.
  // IMPORTANT: both are awaited — pricing MUST be ready before enrichment.
  const [results, fetchResults] = await Promise.all([
    Promise.all(toCheck.map(({ domain, matchType }) => checkOneDomain(domain, source, sourceUrl, matchType))),
    preloadAllPricing(),
  ]);

  const apiSources = fetchResults.filter((r) => r.source === "api").map((r) => r.registrar);
  const staticSources = fetchResults.filter((r) => r.source === "static").map((r) => r.registrar);
  console.log(`[Pricing] Sources ready — API: [${apiSources.join(", ") || "none"}] | Static: [${staticSources.join(", ") || "none"}]`);

  // Re-enrich buy links now that ALL pricing is loaded
  const logPricing = process.env.LOG_PRICING !== "0";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    r.buyLinks = getBuyLinks(r.domain, logPricing && i < 5);
    r.registerUrl = r.buyLinks[0]?.url;
  }

  const availCount = results.filter((r) => r.available).length;
  const elapsed = Date.now() - startTime;
  console.log(`[Registry] Done in ${elapsed}ms: ${availCount} available, ${results.length - availCount} taken`);

  return { results, userTld };
}

export interface SearchDomainsMultiSourceResult {
  results: DomainResult[];
  sourceStatuses: SourceStatus[];
}

export async function searchDomainsMultiSource(keyword: string): Promise<SearchDomainsMultiSourceResult> {
  const { results: list, userTld } = await searchRegistry(keyword);
  const sourceStatuses: SourceStatus[] = [{ name: "Registry (RDAP/DNS)", status: "ok", count: list.length }];

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

  // Fetch RDAP details for taken domains
  const taken = list.filter((r) => !r.available);
  if (taken.length > 0) {
    console.log(`[RDAP] Fetching registration details for ${taken.length} taken domains`);
    const detailsResults = await Promise.all(taken.map((r) => fetchRdapDetails(r.domain)));
    const fetched = detailsResults.filter(Boolean).length;
    detailsResults.forEach((details, i) => {
      if (details) taken[i].registration = details;
    });
    console.log(`[RDAP] Got details for ${fetched}/${taken.length} taken domains`);
  }

  const pricesCount = list.filter((r) => r.buyLinks?.some((l) => l.priceNum != null)).length;
  console.log(`[Pricing] ${pricesCount}/${list.length} domains have at least one price`);

  const first = list[0];
  if (first?.buyLinks?.length) {
    const src = first.buyLinks.map((l) => `${l.name}=${l.price ?? "—"}`).join(", ");
    console.log(`[Pricing] Sample (${first.domain}): ${src}`);
  }

  console.log("[Search] DATA SOURCES: Porkbun=live API | GoDaddy/Namecheap=API(if creds set) or static | Cloudflare/Spaceship=static at-cost | Availability=RDAP+DNS");

  return { results: list, sourceStatuses };
}

export async function searchDomains(keyword: string): Promise<DomainResult[]> {
  const { results } = await searchDomainsMultiSource(keyword);
  return results;
}
