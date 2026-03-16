import { searchAllRegistrars, buildMergedBuyLinks, ALL_REGISTRARS } from "./registrars";
import type { BuyLink, RegistrarSearchResult, RegistrarSearchHit } from "./registrars";

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

/** Used for keyword parsing and TLD sort order — not for DNS probing. */
const COMMON_TLDS = [
  ".com", ".net", ".org", ".io", ".co", ".dev", ".app", ".ai",
  ".xyz", ".me", ".info", ".biz", ".us", ".tv", ".online", ".site",
  ".tech", ".store", ".club", ".world",
];

const TLD_ORDER: Record<string, number> = Object.fromEntries(
  COMMON_TLDS.map((tld, i) => [tld, i])
);

function tldSortKey(tld: string): number {
  return TLD_ORDER[tld] ?? 999;
}

export function parseKeyword(keyword: string): { baseName: string; userTld?: string } {
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

export function buildSearchResults(
  domainSearchHits: Map<string, Map<string, RegistrarSearchHit>>,
  baseName: string,
  userTld?: string,
  dnsAvailability?: Map<string, boolean>,
): DomainResult[] {
  const userExactDomain = userTld ? `${baseName}${userTld}` : null;
  const results: DomainResult[] = [];

  // Registrar-returned domains are the primary source.
  // DNS (when available) is the authoritative tiebreaker for availability.
  for (const [domain, hits] of domainSearchHits) {
    const registrarVotes = [...hits.values()];
    const anyPremium = registrarVotes.some((h) => h.premium);

    // Filter out scraping artifacts — domains that don't contain the base keyword
    // (e.g. "it.com", "gb.net" appearing when searching "donadomains")
    if (!domain.startsWith(baseName) && !domain.includes(baseName)) continue;

    // Determine availability:
    // 1. DNS is authoritative when present
    // 2. Fall back to registrar majority vote
    let available: boolean;
    if (dnsAvailability?.has(domain)) {
      available = !anyPremium && (dnsAvailability.get(domain) ?? false);
    } else {
      // No DNS data yet — use registrar signal (at least one says available + has pricing)
      available = !anyPremium && registrarVotes.some((h) => h.available && h.registration != null);
    }

    const tld = extractTld(domain);
    const buyLinks = available ? buildMergedBuyLinks(domain, hits) : [];

    // Skip available domains with no pricing (no registrar had a price)
    if (available && buyLinks.length === 0 && domain !== userExactDomain) continue;

    // Skip taken domains that DNS hasn't confirmed yet (avoid showing
    // random "similar" suggestions like google.com as taken)
    if (!available && dnsAvailability && !dnsAvailability.has(domain)) continue;

    const isExact = domain === `${baseName}${tld}`;

    results.push({
      domain,
      available,
      tld,
      matchType: isExact ? "exact" : "similar",
      buyLinks,
      registerUrl: buyLinks[0]?.url,
    });
  }

  results.sort((a, b) => {
    if (userExactDomain) {
      if (a.domain === userExactDomain && b.domain !== userExactDomain) return -1;
      if (a.domain !== userExactDomain && b.domain === userExactDomain) return 1;
    }
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (userTld) {
      if (a.tld === userTld && b.tld !== userTld) return -1;
      if (a.tld !== userTld && b.tld === userTld) return 1;
    }
    const exactA = a.matchType === "exact" ? 0 : 1;
    const exactB = b.matchType === "exact" ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    const tldDiff = tldSortKey(a.tld) - tldSortKey(b.tld);
    if (tldDiff !== 0) return tldDiff;
    return (b.buyLinks?.length ?? 0) - (a.buyLinks?.length ?? 0);
  });

  return results;
}

// ─── RDAP Bootstrap ─────────────────────────────────────────────────────────

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_DIRECT_TIMEOUT_MS = 3000;
const RDAP_FALLBACK_TIMEOUT_MS = 5000;
const RDAP_DETAILS_TIMEOUT_MS = 4000;

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
          if (tld && url) map.set(tld, url.endsWith("/") ? url : `${url}/`);
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

// ─── DNS / RDAP Availability Removed ────────────────────────────────────────

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

function parseRdapResponse(raw: Record<string, unknown>): DomainRegistrationDetails | null {
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
  // Note: we intentionally do NOT fall back to abuse/administrative/technical
  // contacts. Those belong to the registrar (e.g. abuse@godaddy.com), not the
  // domain owner. Showing them as owner contact info would be misleading.
  const rawAny = raw as Record<string, unknown>;
  if (!out.registrar && typeof rawAny.registrar === "string") out.registrar = rawAny.registrar;
  if (!out.registrant && typeof rawAny.registrant === "string") out.registrant = rawAny.registrant;

  return Object.keys(out).length > 0 ? out : null;
}

export async function fetchRdapDetails(domain: string): Promise<DomainRegistrationDetails | null> {
  try {
    let res = await rdapFetch(domain, RDAP_DETAILS_TIMEOUT_MS);
    if (!res.ok && res.status === 404) {
      const fallback = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(RDAP_DETAILS_TIMEOUT_MS) });
      if (fallback.ok) res = fallback;
    }
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    return parseRdapResponse(raw);
  } catch {
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

// ─── Search: merge registrar scrapes + pricing ──────────────────────────────

export interface SearchDomainsMultiSourceResult {
  results: DomainResult[];
  sourceStatuses: SourceStatus[];
}

export async function searchDomainsMultiSource(keyword: string): Promise<SearchDomainsMultiSourceResult> {
  const startTime = Date.now();
  const { baseName, userTld } = parseKeyword(keyword);

  if (!baseName) return { results: [], sourceStatuses: [] };

  const registrarResults = await searchAllRegistrars(baseName);

  const domainSearchHits = new Map<string, Map<string, RegistrarSearchHit>>();
  for (const result of registrarResults) {
    for (const hit of result.hits) {
      const d = hit.domain.toLowerCase();
      if (!domainSearchHits.has(d)) domainSearchHits.set(d, new Map());
      domainSearchHits.get(d)!.set(result.registrar, hit);
    }
  }

  const results = buildSearchResults(domainSearchHits, baseName, userTld);

  const sourceStatuses: SourceStatus[] = registrarResults.map((r) => ({
    name: r.registrar,
    status: (r.hits.length > 0 ? "ok" : "failed") as "ok" | "failed",
    count: r.hits.length,
    error: r.error,
  }));

  console.log(`[Search] Found ${results.length} domains in ${Date.now() - startTime}ms`);

  return { results, sourceStatuses };
}

export async function searchDomains(keyword: string): Promise<DomainResult[]> {
  const { results } = await searchDomainsMultiSource(keyword);
  return results;
}
