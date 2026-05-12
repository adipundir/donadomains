/**
 * Generic WHOIS text → structured record parser.
 *
 * WHOIS responses are notoriously inconsistent — every registry uses its
 * own labels. This parser maps the ~80% of common labels seen across
 * gTLDs (ICANN-mandated format) and major ccTLDs to a single shape.
 *
 * Anything we can't recognize is silently dropped — never thrown.
 */

export interface WhoisParsed {
  registrar?: string;
  registrarUrl?: string;
  /**
   * Some registries are "thin" — the registry WHOIS only returns
   * `Registrar WHOIS Server:` and you re-query that for full data.
   */
  registrarWhoisServer?: string;
  registrant?: string;
  organization?: string;
  created?: string;
  updated?: string;
  expires?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  status?: string[];
  nameservers?: string[];
  dnssec?: string;
}

// Values that mean "no useful data here" — drop them.
const NULL_VALUES = [
  /^redacted/i,
  /privacy/i,
  /data protected/i,
  /not disclosed/i,
  /withheld/i,
  /gdpr/i,
  /^please query/i,
  /^-+$/,
  /^n\/a$/i,
  /^\.$/,
];

function isNullish(v: string): boolean {
  return NULL_VALUES.some((re) => re.test(v));
}

function cleanValue(v: string): string | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (isNullish(trimmed)) return null;
  // Some lines append ICANN suffixes: "ok https://icann.org/epp#ok"
  // For status fields we want just the keyword; strip URL tail.
  return trimmed.split(/\s+https?:\/\//)[0].trim() || null;
}

interface KeyRule {
  re: RegExp;
  field: keyof WhoisParsed;
}

// Order matters — more specific patterns first.
const KEY_RULES: KeyRule[] = [
  // Registrar (don't match abuse/url/server)
  { re: /^(?:sponsoring\s+)?registrar(?:\s+name)?$/i, field: "registrar" },
  { re: /^registrar\s+url$/i, field: "registrarUrl" },
  { re: /^registrar\s+whois\s+server$/i, field: "registrarWhoisServer" },

  // Registrant
  { re: /^registrant(?:\s+name)?$/i, field: "registrant" },
  { re: /^registrant\s+organization$/i, field: "organization" },
  { re: /^owner$/i, field: "registrant" },
  { re: /^owner\s+name$/i, field: "registrant" },

  // Dates — ordered so "expiry" wins over generic patterns
  { re: /^(?:registry\s+)?expiry?\s+date$/i, field: "expires" },
  { re: /^expir(?:ation|y)\s+date$/i, field: "expires" },
  { re: /^expires(?:\s+on)?$/i, field: "expires" },
  { re: /^paid-till$/i, field: "expires" },
  { re: /^renewal\s+date$/i, field: "expires" },
  { re: /^(?:creation\s+date|created(?:\s+on)?|registered(?:\s+on)?|registration\s+date|domain\s+registered\s+date)$/i, field: "created" },
  { re: /^(?:updated\s+date|last\s+updated|last\s+modified|modified)$/i, field: "updated" },
  { re: /^changed$/i, field: "updated" },

  // Contact
  { re: /^registrant\s+email$/i, field: "contactEmail" },
  { re: /^registrant\s+phone$/i, field: "contactPhone" },

  // Misc
  { re: /^dnssec$/i, field: "dnssec" },
];

const STATUS_RE = /^domain\s+status$/i;
const NS_RE = /^(?:name\s+server|nserver|nameserver)s?$/i;
const ADDR_RE = /^registrant\s+(?:street|city|state\/?provinc?e|postal\s+code|country)$/i;

const LINE_RE = /^\s*([A-Za-z][A-Za-z0-9 _\/\-]+?)\s*:\s*(.+?)\s*$/;

export function parseWhoisText(text: string): WhoisParsed | null {
  if (!text || text.length === 0) return null;

  const out: WhoisParsed = {};
  const nameservers: string[] = [];
  const statuses: string[] = [];
  const addrParts: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    // Skip comments + non-data lines
    if (!rawLine || /^[%#>]/.test(rawLine)) continue;

    const m = rawLine.match(LINE_RE);
    if (!m) continue;
    const rawKey = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    const val = cleanValue(m[2]);
    if (!val) continue;

    // Status — can appear multiple times
    if (STATUS_RE.test(rawKey)) {
      const code = val.split(/\s+/)[0];
      if (code && !statuses.includes(code)) statuses.push(code);
      continue;
    }

    // Nameservers — can appear multiple times
    if (NS_RE.test(rawKey)) {
      const ns = val.split(/\s+/)[0].toLowerCase().replace(/\.$/, "");
      if (ns && !nameservers.includes(ns)) nameservers.push(ns);
      continue;
    }

    // Address pieces — aggregate
    if (ADDR_RE.test(rawKey)) {
      addrParts.push(val);
      continue;
    }

    // Standard scalar keys
    for (const rule of KEY_RULES) {
      if (rule.re.test(rawKey)) {
        if (out[rule.field] === undefined) {
          (out as Record<string, unknown>)[rule.field] = val;
        }
        break;
      }
    }
  }

  if (nameservers.length) out.nameservers = nameservers;
  if (statuses.length) out.status = statuses;
  if (addrParts.length) out.contactAddress = addrParts.join(", ");

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Merge two WHOIS results, preferring thick (registrar-side) data for
 * contact fields and thin (registry-side) data for authoritative metadata
 * (expiry, status, nameservers).
 */
export function mergeWhoisParsed(thin: WhoisParsed, thick: WhoisParsed): WhoisParsed {
  return {
    // Registry-authoritative
    expires: thin.expires ?? thick.expires,
    status: thin.status ?? thick.status,
    nameservers: thin.nameservers ?? thick.nameservers,
    dnssec: thin.dnssec ?? thick.dnssec,

    // Registrar-authoritative
    registrar: thick.registrar ?? thin.registrar,
    registrarUrl: thick.registrarUrl ?? thin.registrarUrl,

    // Either source
    created: thin.created ?? thick.created,
    updated: thick.updated ?? thin.updated,
    registrant: thick.registrant ?? thin.registrant,
    organization: thick.organization ?? thin.organization,
    contactEmail: thick.contactEmail ?? thin.contactEmail,
    contactPhone: thick.contactPhone ?? thin.contactPhone,
    contactAddress: thick.contactAddress ?? thin.contactAddress,
    registrarWhoisServer: thin.registrarWhoisServer ?? thick.registrarWhoisServer,
  };
}
