/**
 * IANA RDAP bootstrap loader with tiered caching.
 *
 *   1. In-process cache (per-instance, lives until cold start)
 *   2. Postgres cache (7-day TTL, shared across instances)
 *   3. IANA fetch (https://data.iana.org/rdap/dns.json) — last resort
 *
 * The bootstrap maps TLD → RDAP server URL. Currently ~590 entries, ~80KB
 * JSON. Persisting to DB eliminates the cold-start fetch (~1-3s) for every
 * new serverless instance.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { rdapBootstrapCache } from "./schema";
import { log, timer } from "./log";

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const IANA_FETCH_TIMEOUT_MS = 8_000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY = "dns";

const HARDCODED_FALLBACK: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/",
};

interface BootstrapData {
  services: Array<[string[], string[]]>;
}

let memCache: Map<string, string> | null = null;
let inFlight: Promise<Map<string, string>> | null = null;

export async function loadRdapBootstrap(): Promise<Map<string, string>> {
  if (memCache) return memCache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const map = new Map<string, string>(Object.entries(HARDCODED_FALLBACK));

    // 1. DB cache
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(rdapBootstrapCache)
        .where(eq(rdapBootstrapCache.key, CACHE_KEY))
        .limit(1);
      if (rows.length > 0 && rows[0].expiresAt > new Date()) {
        ingestBootstrap(rows[0].data as BootstrapData, map);
        memCache = map;
        log.debug("rdap.bootstrap.db_hit", { tlds: map.size });
        return map;
      }
    } catch (err) {
      log.warn("rdap.bootstrap.db_read_failed", { error: (err as Error).message });
    }

    // 2. IANA fetch
    const done = timer();
    try {
      const res = await fetch(IANA_BOOTSTRAP_URL, {
        signal: AbortSignal.timeout(IANA_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BootstrapData;
      ingestBootstrap(data, map);

      // Write-through cache (fire-and-forget)
      void persistBootstrap(data);

      log.info("rdap.bootstrap.iana_fetched", { tlds: map.size, ms: done() });
    } catch (err) {
      log.warn("rdap.bootstrap.iana_failed", { error: (err as Error).message, ms: done() });
      // Fall through with hardcoded fallback only
    }

    memCache = map;
    return map;
  })();

  return inFlight;
}

function ingestBootstrap(data: BootstrapData, map: Map<string, string>): void {
  for (const [tlds, urls] of data.services ?? []) {
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
    const url = urls[0]; // RDAP uses [0] for the primary, others are fallbacks
    if (!url) continue;
    const normalized = url.endsWith("/") ? url : `${url}/`;
    for (const tld of tlds) {
      const key = String(tld).toLowerCase();
      if (key) map.set(key, normalized);
    }
  }
}

async function persistBootstrap(data: BootstrapData): Promise<void> {
  try {
    const db = getDb();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await db
      .insert(rdapBootstrapCache)
      .values({ key: CACHE_KEY, data, expiresAt })
      .onConflictDoUpdate({
        target: rdapBootstrapCache.key,
        set: { data, expiresAt, fetchedAt: new Date() },
      });
  } catch (err) {
    log.warn("rdap.bootstrap.db_write_failed", { error: (err as Error).message });
  }
}

/**
 * True if the given TLD has an RDAP server registered with IANA.
 * Used to decide whether to even attempt RDAP for a domain.
 */
export async function tldHasRdap(tld: string): Promise<boolean> {
  const key = tld.toLowerCase().replace(/^\./, "");
  const map = await loadRdapBootstrap();
  return map.has(key);
}

export async function getRdapServerForTld(tld: string): Promise<string | null> {
  const key = tld.toLowerCase().replace(/^\./, "");
  const map = await loadRdapBootstrap();
  return map.get(key) ?? null;
}
