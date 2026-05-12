/**
 * Domain Intelligence — comprehensive domain details from multiple sources.
 *
 * Production pipeline (cache-first, smart-routed):
 *
 *   Read-through cache (Postgres, ~50ms) → on miss:
 *     Layer 1a: DNS-over-HTTPS         (~50ms,  free, always runs)
 *     Layer 1b: RDAP                   (~500ms, free, only if TLD has RDAP)
 *     Layer 1c: WHOIS port-43          (~500ms, free, fills gaps + RDAP-less TLDs)
 *     Layer 2:  Firecrawl who.is scrape (paid, only if registered but still bare)
 *   Write-through cache with TTL based on result quality
 *
 * `.sh`, `.io`, `.ac` and other RDAP-less TLDs go straight to WHOIS port-43
 * since RDAP would return 404. For TLDs with RDAP we still fall back to
 * WHOIS port-43 if RDAP returns insufficient data.
 *
 * No system binaries required — runs on Vercel serverless (Node.js runtime).
 */

import { fetchRdapDetails } from "./domain-scraper";
import { firecrawlScrape } from "./registrars/firecrawl-client";
import { tldHasRdap } from "./rdap-bootstrap";
import { whoisLookup } from "./whois";
import { readIntelCache, writeIntelCache, type CachedIntel } from "./intel-cache";
import { log, timer } from "./log";

// ─── Public types ────────────────────────────────────────────────────────────

export interface DomainIntel {
  domain: string;

  // Availability / status
  registered: boolean;
  status?: string[];

  // Dates
  created?: string;
  updated?: string;
  expires?: string;

  // Registrar
  registrar?: string;
  registrarUrl?: string;

  // Registrant / owner
  registrant?: string;
  organization?: string;

  // Contact
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;

  // DNS
  nameservers?: string[];

  // DNSSEC
  dnssec?: string;

  // Sources that contributed data (e.g. "rdap", "dns", "whois43", "who.is")
  sources: string[];

  // Per-source latency in ms
  timing: Record<string, number>;

  // ISO timestamp of the last fresh fetch (not cache read time)
  fetchedAt?: string;
}

export interface FetchIntelOptions {
  /** Skip the read-through cache. Default false. */
  skipCache?: boolean;
  /** Skip the write-through cache. Default false. */
  skipPersist?: boolean;
}

export interface IntelMeta {
  intel: DomainIntel;
  cacheHit: boolean;
  ageMs: number; // 0 for fresh fetches
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Fetch full DomainIntel. Cached by default. Returns just the intel; for
 * cache-hit metadata, use `fetchDomainIntelWithMeta`.
 */
export async function fetchDomainIntel(
  domain: string,
  opts: FetchIntelOptions = {},
): Promise<DomainIntel> {
  const { intel } = await fetchDomainIntelWithMeta(domain, opts);
  return intel;
}

export async function fetchDomainIntelWithMeta(
  domain: string,
  opts: FetchIntelOptions = {},
): Promise<IntelMeta> {
  const d = domain.toLowerCase().trim();
  const totalTimer = timer();

  // 1. Cache check
  if (!opts.skipCache) {
    const cached: CachedIntel | null = await readIntelCache(d);
    if (cached) {
      return { intel: cached.intel, cacheHit: true, ageMs: cached.ageMs };
    }
  }

  // 2. Fresh fetch with smart routing
  const intel = await fetchFreshIntel(d);
  intel.fetchedAt = new Date().toISOString();

  // 3. Persist
  if (!opts.skipPersist) {
    void writeIntelCache(d, intel);
  }

  log.info("intel.fetched", {
    domain: d,
    sources: intel.sources,
    registered: intel.registered,
    hasRegistrar: Boolean(intel.registrar),
    hasExpiry: Boolean(intel.expires),
    totalMs: totalTimer(),
    layerMs: intel.timing,
  });

  return { intel, cacheHit: false, ageMs: 0 };
}

async function fetchFreshIntel(d: string): Promise<DomainIntel> {
  const intel: DomainIntel = {
    domain: d,
    registered: false,
    sources: [],
    timing: {},
  };

  const tld = extractTld(d);
  const hasRdap = await tldHasRdap(tld);

  // Layer 1 — always run DNS, always run something for registration metadata.
  //   - TLDs with RDAP: run RDAP + DNS in parallel
  //   - TLDs without RDAP (.sh, .io, .ac, …): run WHOIS43 + DNS in parallel
  const primaryPromises: Promise<void>[] = [applyDns(intel)];
  if (hasRdap) {
    primaryPromises.push(applyRdap(intel));
  } else {
    primaryPromises.push(applyWhois43(intel));
  }
  await Promise.allSettled(primaryPromises);

  // Layer 1b — if RDAP ran but came back thin, top up with WHOIS43.
  // This catches GDPR-redacted entities, slow registries, and registrars whose
  // RDAP server is up but returns sparse data.
  const rdapSparse =
    hasRdap &&
    intel.registered &&
    (!intel.registrar || (!intel.created && !intel.expires));
  if (rdapSparse) {
    await applyWhois43(intel);
  }

  // Layer 2 — last resort scrape of who.is (paid, slow).
  // Only if domain looks registered but we still have nothing useful.
  const stillCritical = !intel.registrar && !intel.created && !intel.expires;
  if (intel.registered && stillCritical) {
    await applyWhoIsScrape(intel);
  }

  return intel;
}

function extractTld(domain: string): string {
  const parts = domain.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// ─── Lightweight DNS check (for watch system) ────────────────────────────────

export interface DnsProbe {
  resolves: boolean;
  nameservers: string[];
}

/**
 * Fast DNS probe via Cloudflare DoH. ~50ms, no RDAP overhead.
 * Used by the watch system for quick availability checks.
 */
export async function probeDns(domain: string): Promise<DnsProbe> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return { resolves: false, nameservers: [] };

    const data = (await res.json()) as {
      Status: number;
      Answer?: Array<{ type: number; data: string }>;
    };

    // Status 0 = NOERROR, 3 = NXDOMAIN
    if (data.Status === 3) return { resolves: false, nameservers: [] };

    const ns = (data.Answer ?? [])
      .filter((a) => a.type === 2) // NS record type
      .map((a) => a.data.replace(/\.$/, "").toLowerCase())
      .filter(Boolean);

    return { resolves: ns.length > 0 || data.Status === 0, nameservers: ns };
  } catch {
    return { resolves: false, nameservers: [] };
  }
}

// ─── Layer 1a: RDAP ──────────────────────────────────────────────────────────

async function applyRdap(intel: DomainIntel): Promise<void> {
  const done = timer();
  try {
    const details = await fetchRdapDetails(intel.domain);
    intel.timing.rdap = done();

    if (!details) return;

    intel.sources.push("rdap");
    intel.registered = true;

    if (details.registrar) intel.registrar = details.registrar;
    if (details.registrant) intel.registrant = details.registrant;
    if (details.created) intel.created = details.created;
    if (details.expires) intel.expires = details.expires;
    if (details.contactEmail) intel.contactEmail = details.contactEmail;
    if (details.contactPhone) intel.contactPhone = details.contactPhone.replace(/^tel:/i, "");
    if (details.contactAddress) intel.contactAddress = details.contactAddress;
    if (details.status?.length) intel.status = details.status;
  } catch (err) {
    intel.timing.rdap = done();
    log.debug("intel.rdap_failed", { domain: intel.domain, error: (err as Error).message });
  }
}

// ─── Layer 1b: WHOIS port-43 ─────────────────────────────────────────────────

async function applyWhois43(intel: DomainIntel): Promise<void> {
  const done = timer();
  try {
    const w = await whoisLookup(intel.domain, { timeoutMs: 4000 });
    intel.timing.whois43 = done();

    if (!w) return;

    // Mark registered if we got back anything that strongly implies registration.
    const looksRegistered = Boolean(
      w.registrar || w.created || w.expires || (w.nameservers && w.nameservers.length > 0),
    );
    if (looksRegistered) intel.registered = true;

    intel.sources.push("whois43");

    // Fill gaps only — never overwrite RDAP fields, which are usually richer.
    if (!intel.registrar && w.registrar) intel.registrar = w.registrar;
    if (!intel.registrarUrl && w.registrarUrl) intel.registrarUrl = w.registrarUrl;
    if (!intel.registrant && w.registrant) intel.registrant = w.registrant;
    if (!intel.organization && w.organization) intel.organization = w.organization;
    if (!intel.created && w.created) intel.created = w.created;
    if (!intel.updated && w.updated) intel.updated = w.updated;
    if (!intel.expires && w.expires) intel.expires = w.expires;
    if (!intel.contactEmail && w.contactEmail) intel.contactEmail = w.contactEmail;
    if (!intel.contactPhone && w.contactPhone) intel.contactPhone = w.contactPhone;
    if (!intel.contactAddress && w.contactAddress) intel.contactAddress = w.contactAddress;
    if ((!intel.nameservers || intel.nameservers.length === 0) && w.nameservers?.length) {
      intel.nameservers = w.nameservers;
    }
    if (!intel.dnssec && w.dnssec) intel.dnssec = w.dnssec;
    if ((!intel.status || intel.status.length === 0) && w.status?.length) intel.status = w.status;
  } catch (err) {
    intel.timing.whois43 = done();
    log.debug("intel.whois43_failed", { domain: intel.domain, error: (err as Error).message });
  }
}

// ─── Layer 1c: DNS-over-HTTPS ────────────────────────────────────────────────

async function applyDns(intel: DomainIntel): Promise<void> {
  const done = timer();
  try {
    const probe = await probeDns(intel.domain);
    intel.timing.dns = done();

    if (!probe.nameservers.length) return;

    intel.sources.push("dns");
    if (probe.resolves) intel.registered = true;
    intel.nameservers = probe.nameservers;
  } catch (err) {
    intel.timing.dns = done();
    log.debug("intel.dns_failed", { domain: intel.domain, error: (err as Error).message });
  }
}

// ─── Layer 2: Firecrawl scrape of who.is (last resort, paid) ────────────────

async function applyWhoIsScrape(intel: DomainIntel): Promise<void> {
  const done = timer();
  try {
    const url = `https://who.is/whois/${intel.domain}`;
    const result = await firecrawlScrape(url, 8000, process.env.FIRECRAWL_API_KEY_WHOIS ?? "");
    intel.timing["who.is"] = done();

    if (!result.success || !result.markdown) return;

    const parsed = parseWhoIsMarkdown(result.markdown);
    if (!parsed) return;

    intel.sources.push("who.is");

    // Fill gaps only — never overwrite earlier layers
    if (!intel.registrar && parsed.registrar) intel.registrar = parsed.registrar;
    if (!intel.registrarUrl && parsed.registrarUrl) intel.registrarUrl = parsed.registrarUrl;
    if (!intel.registrant && parsed.registrant) intel.registrant = parsed.registrant;
    if (!intel.organization && parsed.organization) intel.organization = parsed.organization;
    if (!intel.created && parsed.created) intel.created = parsed.created;
    if (!intel.updated && parsed.updated) intel.updated = parsed.updated;
    if (!intel.expires && parsed.expires) intel.expires = parsed.expires;
    if (!intel.contactEmail && parsed.contactEmail) intel.contactEmail = parsed.contactEmail;
    if (!intel.contactPhone && parsed.contactPhone) intel.contactPhone = parsed.contactPhone;
    if (!intel.contactAddress && parsed.contactAddress) intel.contactAddress = parsed.contactAddress;
    if (!intel.nameservers?.length && parsed.nameservers?.length) intel.nameservers = parsed.nameservers;
    if (!intel.dnssec && parsed.dnssec) intel.dnssec = parsed.dnssec;
  } catch (err) {
    intel.timing["who.is"] = done();
    log.debug("intel.whois_scrape_failed", { domain: intel.domain, error: (err as Error).message });
  }
}

interface WhoIsParsed {
  registrar?: string;
  registrarUrl?: string;
  registrant?: string;
  organization?: string;
  created?: string;
  updated?: string;
  expires?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  nameservers?: string[];
  dnssec?: string;
}

function parseWhoIsMarkdown(md: string): WhoIsParsed | null {
  const result: WhoIsParsed = {};
  const nameservers: string[] = [];

  const lines = md.split("\n");

  for (const line of lines) {
    const trimmed = line.trim().replace(/\*\*/g, "").replace(/\|/g, "").trim();
    if (!trimmed) continue;

    if (/redact|privacy|data protected|not disclosed|withheld|gdpr|please query/i.test(trimmed)) continue;

    const kvMatch = trimmed.match(/^([A-Za-z\s/]+?)[:]\s+(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim().toLowerCase();
    const val = kvMatch[2].trim();
    if (!val) continue;

    if ((key === "registrar" || key.includes("registrar")) && !key.includes("url") && !key.includes("abuse")) {
      if (!result.registrar && val.length < 200) result.registrar = val;
    } else if (key.includes("registrar") && key.includes("url")) {
      if (!result.registrarUrl) result.registrarUrl = val;
    } else if (key === "registrant name" || key === "registrant") {
      if (!result.registrant) result.registrant = val;
    } else if (key === "registrant organization" || key === "organization") {
      if (!result.organization) result.organization = val;
    } else if (key.includes("creation") || key.includes("created") || key === "registered") {
      if (!result.created) result.created = val;
    } else if (key.includes("updated") || key.includes("modified")) {
      if (!result.updated) result.updated = val;
    } else if (key.includes("expir") || key.includes("expiry") || key === "paid-till") {
      if (!result.expires) result.expires = val;
    } else if (key.includes("email") && val.includes("@")) {
      if (!result.contactEmail) result.contactEmail = val;
    } else if (key.includes("phone") || key.includes("tel")) {
      if (!result.contactPhone) result.contactPhone = val.replace(/^tel:/i, "");
    } else if (key.includes("street") || key.includes("city") || key.includes("state") || key.includes("country") || key.includes("address")) {
      // Filter out IPs, markdown links, and junk
      if (/^\[?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(val) || val.includes("](")) continue;
      result.contactAddress = result.contactAddress ? `${result.contactAddress}, ${val}` : val;
    } else if (key === "name server" || key === "nameserver" || key === "nserver") {
      const ns = val.toLowerCase().split(/\s+/)[0];
      if (ns && !nameservers.includes(ns)) nameservers.push(ns);
    } else if (key === "dnssec") {
      result.dnssec = val;
    }
  }

  // Extract nameservers from markdown lists: "- ns1.example.com"
  const nsBlockMatch = md.match(/name\s*servers?[:\s]*\n((?:[\s*-]*[a-z0-9.-]+\.[a-z]{2,}\s*\n?)+)/i);
  if (nsBlockMatch && !nameservers.length) {
    const nsLines = nsBlockMatch[1].split("\n");
    for (const nsLine of nsLines) {
      const ns = nsLine.replace(/^[\s*-]+/, "").trim().toLowerCase();
      if (ns && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(ns) && !nameservers.includes(ns)) {
        nameservers.push(ns);
      }
    }
  }

  if (nameservers.length) result.nameservers = nameservers;

  return Object.keys(result).length > 0 ? result : null;
}
