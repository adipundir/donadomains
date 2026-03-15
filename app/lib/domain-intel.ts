/**
 * Domain Intelligence — comprehensive domain details from multiple sources.
 *
 * Production-ready layered approach:
 *   1. RDAP  (free, HTTP-based, works on serverless)
 *   2. DNS-over-HTTPS (free, fast — nameservers + resolution check)
 *   3. Firecrawl scrape of who.is (paid, comprehensive fallback)
 *
 * No system binaries required — runs on Vercel serverless.
 */

import { fetchRdapDetails } from "./domain-scraper";
import { firecrawlScrape } from "./registrars/firecrawl-client";

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

  // Sources that contributed data
  sources: string[];

  // Per-source timing
  timing: Record<string, number>;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function fetchDomainIntel(domain: string): Promise<DomainIntel> {
  const d = domain.toLowerCase().trim();
  const intel: DomainIntel = {
    domain: d,
    registered: false,
    sources: [],
    timing: {},
  };

  // Layer 1 + 2 in parallel: RDAP (registration data) + DNS (nameservers)
  await Promise.allSettled([applyRdap(intel), applyDns(intel)]);

  // Layer 3: Firecrawl scrape only if RDAP gave us almost nothing.
  // If RDAP returned registrar + dates, the domain is just privacy-protected
  // and who.is won't have the data either — skip the expensive scrape.
  const hasBasicRdap = intel.registrar && (intel.created || intel.expires);
  const missingCritical = !intel.registrar && !intel.created && !intel.expires;
  if (intel.registered && !hasBasicRdap && missingCritical) {
    await applyWhoIsScrape(intel);
  }

  return intel;
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

// ─── Layer 1: RDAP ───────────────────────────────────────────────────────────

async function applyRdap(intel: DomainIntel): Promise<void> {
  const t0 = Date.now();
  try {
    const details = await fetchRdapDetails(intel.domain);
    intel.timing.rdap = Date.now() - t0;

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
  } catch {
    intel.timing.rdap = Date.now() - t0;
  }
}

// ─── Layer 2: DNS-over-HTTPS ─────────────────────────────────────────────────

async function applyDns(intel: DomainIntel): Promise<void> {
  const t0 = Date.now();
  try {
    const probe = await probeDns(intel.domain);
    intel.timing.dns = Date.now() - t0;

    if (!probe.nameservers.length) return;

    intel.sources.push("dns");
    if (probe.resolves) intel.registered = true;
    intel.nameservers = probe.nameservers;
  } catch {
    intel.timing.dns = Date.now() - t0;
  }
}

// ─── Layer 3: Firecrawl scrape of who.is ─────────────────────────────────────

async function applyWhoIsScrape(intel: DomainIntel): Promise<void> {
  const t0 = Date.now();
  try {
    const url = `https://who.is/whois/${intel.domain}`;
    const result = await firecrawlScrape(url, 8000);
    intel.timing["who.is"] = Date.now() - t0;

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
  } catch {
    intel.timing["who.is"] = Date.now() - t0;
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
