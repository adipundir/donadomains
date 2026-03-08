import dns from "dns";
import { promisify } from "util";
import {
  preloadAllPricing,
  searchAllRegistrars,
  buildMergedBuyLinks,
} from "./registrars";
import type { BuyLink, RegistrarSearchResult, RegistrarSearchHit } from "./registrars";

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

// ─── RDAP Bootstrap ─────────────────────────────────────────────────────────

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_DIRECT_TIMEOUT_MS = 3000;
const RDAP_FALLBACK_TIMEOUT_MS = 5000;
const RDAP_DETAILS_TIMEOUT_MS = 5000;

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

async function checkAvailability(domain: string): Promise<boolean> {
  const dns = await checkDnsAvailability(domain);
  if (dns === false) return false;
  const rdap = await checkRdapAvailability(domain);
  if (rdap.checked) return rdap.available;
  return dns === true;
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
      console.log(`[RDAP][${domain}] registrar=${out.registrar ?? "—"} registrant=${out.registrant ?? "—"} created=${out.created ?? "—"}`);
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

// ─── Search: merge registrar scrapes + RDAP + pricing ───────────────────────

const SIMILAR_SUFFIXES = ["online", "hub", "app", "io", "hq"];
const SIMILAR_PREFIXES = ["my", "get", "the", "go"];
const SIMILAR_TLDS = [".com", ".net", ".org"];

export interface SearchDomainsMultiSourceResult {
  results: DomainResult[];
  sourceStatuses: SourceStatus[];
}

/**
 * Main search pipeline.
 *
 * Runs three strategies in parallel:
 * 1. Registrar search: scrape GoDaddy, Namecheap, Porkbun, Spaceship search pages
 *    via Firecrawl → each returns availability + pricing for many domains in ONE request
 * 2. RDAP/DNS: check availability for keyword + common TLDs (ground truth)
 * 3. Bulk pricing: Porkbun API, Cloudflare GitHub data, static fallbacks
 *
 * Then merges everything: registrar search results provide fresh prices + suggestions,
 * RDAP provides reliable availability, bulk pricing fills gaps.
 */
export async function searchDomainsMultiSource(keyword: string): Promise<SearchDomainsMultiSourceResult> {
  const startTime = Date.now();
  const { baseName, userTld } = parseKeyword(keyword);
  console.log(`\n[Search] ═══ "${keyword}" → base="${baseName}" tld=${userTld ?? "auto"} ═══`);

  if (!baseName) return { results: [], sourceStatuses: [] };

  // Generate domain candidates for RDAP checking
  const exactDomains = COMMON_TLDS.map((tld) => `${baseName}${tld}`);
  const exactSet = new Set(exactDomains);

  const similarDomains: string[] = [];
  for (const suffix of SIMILAR_SUFFIXES) {
    for (const tld of SIMILAR_TLDS) {
      const d = baseName + suffix + tld;
      if (!exactSet.has(d)) similarDomains.push(d);
    }
  }
  for (const prefix of SIMILAR_PREFIXES) {
    for (const tld of SIMILAR_TLDS) {
      const d = prefix + baseName + tld;
      if (!exactSet.has(d)) similarDomains.push(d);
    }
  }

  const allCandidates = [...exactDomains, ...similarDomains];

  // ─── Phase 1: Run everything in parallel ───
  // Pricing fires concurrently but we don't block on it — Porkbun API is slow (~12s).
  // Cloudflare finishes in ~400ms so it'll be ready. Porkbun caches in background.
  const PRICING_TIMEOUT_MS = 3000;
  const pricingRace = Promise.race([
    preloadAllPricing(),
    new Promise<void>((resolve) => setTimeout(resolve, PRICING_TIMEOUT_MS)),
  ]);

  const [registrarResults, rdapAvailability] = await Promise.all([
    searchAllRegistrars(baseName),
    checkAllAvailability(allCandidates),
    pricingRace,
  ]);

  // ─── Phase 2: Build domain → registrar hits map ───
  // For each domain, collect which registrars found it and at what price
  const domainSearchHits = new Map<string, Map<string, RegistrarSearchHit>>();

  for (const result of registrarResults) {
    for (const hit of result.hits) {
      const d = hit.domain.toLowerCase();
      if (!domainSearchHits.has(d)) domainSearchHits.set(d, new Map());
      domainSearchHits.get(d)!.set(result.registrar, hit);
    }
  }

  // ─── Phase 3: Build unified domain list ───
  // Combine domains from RDAP candidates + registrar search discoveries
  const allDomains = new Set<string>();
  for (const d of allCandidates) allDomains.add(d);
  for (const d of domainSearchHits.keys()) allDomains.add(d);

  // ─── Phase 4: Determine availability for each domain ───
  // Cross-reference RDAP with registrar data. Aftermarket/premium domains can
  // return RDAP 404 (looks "available") while registrars correctly list them as taken.
  const domainAvailability = new Map<string, boolean>();
  const premiumDomains = new Set<string>();

  for (const domain of allDomains) {
    const rdapResult = rdapAvailability.get(domain);
    const hits = domainSearchHits.get(domain);
    const registrarVotes = hits ? [...hits.values()] : [];
    const anyPremium = registrarVotes.some((h) => h.premium);
    const anyTaken = registrarVotes.some((h) => !h.available);
    const anyAvailable = registrarVotes.some((h) => h.available);

    if (anyPremium) premiumDomains.add(domain);

    // Premium/aftermarket overrides everything — NOT available at standard price
    if (anyPremium) {
      domainAvailability.set(domain, false);
      continue;
    }

    // RDAP is ground truth for non-premium domains
    if (rdapResult !== undefined) {
      domainAvailability.set(domain, rdapResult);
      continue;
    }

    // No RDAP data — fall back to registrar consensus
    if (registrarVotes.length > 0) {
      const availVotes = registrarVotes.filter((h) => h.available).length;
      domainAvailability.set(domain, availVotes > registrarVotes.length / 2);
      continue;
    }

    domainAvailability.set(domain, false);
  }

  // ─── Phase 5: Build DomainResult for each domain ───
  const results: DomainResult[] = [];

  for (const domain of allDomains) {
    const tld = extractTld(domain);
    const available = domainAvailability.get(domain) ?? false;
    const isPremium = premiumDomains.has(domain);
    const isExact = exactSet.has(domain);
    const isRegistrarDiscovery = !exactSet.has(domain) && !similarDomains.includes(domain);

    const searchHits = domainSearchHits.get(domain) ?? new Map<string, RegistrarSearchHit>();

    // Only build buy links for genuinely available (non-premium) domains.
    // Premium domains get shown as taken — standard TLD prices would be misleading.
    const buyLinks = available && !isPremium ? buildMergedBuyLinks(domain, searchHits) : [];

    const sourceParts: string[] = [];
    if (rdapAvailability.has(domain)) sourceParts.push("RDAP");
    if (searchHits.size > 0) sourceParts.push(...[...searchHits.keys()]);

    results.push({
      domain,
      available,
      tld,
      source: sourceParts.join(" + ") || "RDAP",
      matchType: isExact ? "exact" : isRegistrarDiscovery ? "similar" : "similar",
      buyLinks,
      registerUrl: buyLinks[0]?.url,
    });
  }

  // ─── Phase 6: Sort results ───
  results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    const exactA = a.matchType === "exact" ? 0 : 1;
    const exactB = b.matchType === "exact" ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    if (userTld) {
      if (a.tld === userTld && b.tld !== userTld) return -1;
      if (a.tld !== userTld && b.tld === userTld) return 1;
    }
    // Prefer domains with more buy links (more data)
    const linksA = a.buyLinks?.length ?? 0;
    const linksB = b.buyLinks?.length ?? 0;
    if (linksA !== linksB) return linksB - linksA;
    return tldSortKey(a.tld) - tldSortKey(b.tld);
  });

  // ─── Phase 7: Fetch RDAP details for taken domains ───
  // Only fetch the first 20 (most relevant), with a hard 5s timeout.
  const MAX_RDAP_DETAILS = 20;
  const RDAP_BATCH_TIMEOUT_MS = 5000;
  const taken = results.filter((r) => !r.available);
  const takenToFetch = taken.slice(0, MAX_RDAP_DETAILS);
  if (takenToFetch.length > 0) {
    console.log(`[RDAP] Fetching details for ${takenToFetch.length}/${taken.length} taken domains (${RDAP_BATCH_TIMEOUT_MS}ms cap)...`);
    const detailsPromise = Promise.all(takenToFetch.map((r) => fetchRdapDetails(r.domain)));
    const details = await Promise.race([
      detailsPromise,
      new Promise<(DomainRegistrationDetails | null)[]>((resolve) =>
        setTimeout(() => resolve(takenToFetch.map(() => null)), RDAP_BATCH_TIMEOUT_MS)
      ),
    ]);
    details.forEach((d, i) => { if (d) takenToFetch[i].registration = d; });
    const fetched = details.filter(Boolean).length;
    console.log(`[RDAP] Got details for ${fetched}/${takenToFetch.length}${taken.length > MAX_RDAP_DETAILS ? ` (${taken.length - MAX_RDAP_DETAILS} skipped)` : ""}`);
  }

  // ─── Phase 8: Log summary ───
  const elapsed = Date.now() - startTime;
  const availCount = results.filter((r) => r.available).length;
  const withPrices = results.filter((r) => (r.buyLinks?.length ?? 0) > 0).length;
  const fromSearch = [...domainSearchHits.keys()].length;

  console.log(`\n[Search] ═══ COMPLETE in ${elapsed}ms ═══`);
  console.log(`[Search] ${results.length} domains: ${availCount} available, ${results.length - availCount} taken`);
  console.log(`[Search] ${withPrices} with pricing | ${fromSearch} from registrar searches`);

  const sourceStatuses: SourceStatus[] = [
    { name: "RDAP/DNS", status: "ok", count: rdapAvailability.size },
    ...registrarResults.map((r) => ({
      name: r.registrar,
      status: (r.hits.length > 0 ? "ok" : "failed") as "ok" | "failed",
      count: r.hits.length,
      error: r.error,
    })),
  ];

  return { results, sourceStatuses };
}

/**
 * Check RDAP/DNS availability for a batch of domains in parallel.
 * Returns a map of domain → available.
 */
const RDAP_PER_DOMAIN_TIMEOUT_MS = 4000;

async function checkAllAvailability(domains: string[]): Promise<Map<string, boolean>> {
  console.log(`[RDAP] Checking availability for ${domains.length} domains...`);
  const start = Date.now();

  const results = await Promise.all(
    domains.map(async (domain) => {
      try {
        const available = await Promise.race([
          checkAvailability(domain),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), RDAP_PER_DOMAIN_TIMEOUT_MS)
          ),
        ]);
        return { domain, available };
      } catch {
        return { domain, available: false };
      }
    })
  );

  const map = new Map<string, boolean>();
  for (const r of results) map.set(r.domain, r.available);

  const availCount = [...map.values()].filter(Boolean).length;
  console.log(`[RDAP] Done in ${Date.now() - start}ms: ${availCount} available, ${map.size - availCount} taken`);

  return map;
}

export async function searchDomains(keyword: string): Promise<DomainResult[]> {
  const { results } = await searchDomainsMultiSource(keyword);
  return results;
}
