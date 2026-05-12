/**
 * TLD → WHOIS server discovery.
 *
 * Strategy (tiered):
 *   1. Static seed map (covers ~95% of registered domains, zero RTT)
 *   2. In-process memory cache (per-instance)
 *   3. Postgres cache (30-day TTL, shared across all serverless instances)
 *   4. IANA discovery via `whois.iana.org:43`
 *
 * Negative results (no WHOIS server exists for a TLD) are cached too so we
 * don't re-query IANA on every miss. Stored as empty `server` string.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { whoisServers } from "../schema";
import { log, timer } from "../log";
import { whoisQuery } from "./client";
import { SEED_WHOIS_SERVERS } from "./seed";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const IANA_TIMEOUT_MS = 3500;

// In-process cache. Survives within a warm serverless instance.
const memCache = new Map<string, string | null>();

export async function discoverWhoisServer(tld: string): Promise<string | null> {
  const key = tld.toLowerCase().replace(/^\./, "").trim();
  if (!key) return null;

  // 1. Memory cache
  if (memCache.has(key)) return memCache.get(key) ?? null;

  // 2. Seed map (zero cost)
  const seeded = SEED_WHOIS_SERVERS[key];
  if (seeded !== undefined) {
    memCache.set(key, seeded || null);
    return seeded || null;
  }

  // 3. DB cache
  try {
    const db = getDb();
    const rows = await db
      .select({ server: whoisServers.server })
      .from(whoisServers)
      .where(and(eq(whoisServers.tld, key), gt(whoisServers.expiresAt, new Date())))
      .limit(1);
    if (rows.length > 0) {
      const server = rows[0].server || null;
      memCache.set(key, server);
      return server;
    }
  } catch (err) {
    log.warn("whois.discovery.cache_read_failed", { tld: key, error: (err as Error).message });
  }

  // 4. IANA discovery
  const done = timer();
  const server = await discoverFromIana(key);
  log.info("whois.discovery.iana", { tld: key, server: server ?? null, ms: done() });

  // Persist (write-through cache) — empty string means "known none"
  void persistDiscovery(key, server);

  memCache.set(key, server);
  return server;
}

async function discoverFromIana(tld: string): Promise<string | null> {
  try {
    const raw = await whoisQuery({
      server: "whois.iana.org",
      query: tld,
      timeoutMs: IANA_TIMEOUT_MS,
    });
    // IANA's WHOIS root server returns lines like:
    //   refer: whois.nic.sh
    //   whois: whois.nic.sh
    // Some entries only have "refer:". Prefer "whois:" but fall back to "refer:".
    const whoisMatch = raw.match(/^whois:\s*(\S+)/im);
    if (whoisMatch) return whoisMatch[1].trim().toLowerCase();
    const referMatch = raw.match(/^refer:\s*(\S+)/im);
    if (referMatch) return referMatch[1].trim().toLowerCase();
    return null;
  } catch (err) {
    log.warn("whois.discovery.iana_failed", { tld, error: (err as Error).message });
    return null;
  }
}

async function persistDiscovery(tld: string, server: string | null): Promise<void> {
  try {
    const db = getDb();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await db
      .insert(whoisServers)
      .values({ tld, server: server ?? "", expiresAt })
      .onConflictDoUpdate({
        target: whoisServers.tld,
        set: {
          server: server ?? "",
          fetchedAt: sql`now()`,
          expiresAt,
        },
      });
  } catch (err) {
    log.warn("whois.discovery.cache_write_failed", { tld, error: (err as Error).message });
  }
}
