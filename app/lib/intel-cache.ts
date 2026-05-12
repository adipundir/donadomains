/**
 * Postgres-backed cache for `DomainIntel` responses.
 *
 * TTL is computed per-result so we can refresh stale/sparse data faster:
 *   - Registered + has expiry far away → 24h
 *   - Registered but partial data       → 6h
 *   - Pending-delete / expired           → 1h
 *   - Unregistered (NXDOMAIN)            → 1h
 *   - Error / no data                    → 5min
 *
 * Reads are tolerant: if the DB is unreachable we just skip the cache and
 * fetch fresh data. Writes are fire-and-forget so they never delay the
 * response.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { domainIntelCache } from "./schema";
import type { DomainIntel } from "./domain-intel";
import { log, timer } from "./log";

const REGISTERED_FULL_TTL = 24 * 60 * 60 * 1000;
const REGISTERED_PARTIAL_TTL = 6 * 60 * 60 * 1000;
const PENDING_OR_EXPIRED_TTL = 60 * 60 * 1000;
const UNREGISTERED_TTL = 60 * 60 * 1000;
const ERROR_TTL = 5 * 60 * 1000;

export interface CachedIntel {
  intel: DomainIntel;
  fetchedAt: Date;
  expiresAt: Date;
  ageMs: number;
}

export async function readIntelCache(domain: string): Promise<CachedIntel | null> {
  const done = timer();
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(domainIntelCache)
      .where(eq(domainIntelCache.domain, domain))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];

    if (row.expiresAt <= new Date()) {
      log.debug("intel.cache.expired", { domain, ms: done() });
      return null;
    }

    const intel = row.intel as DomainIntel;
    const ageMs = Date.now() - row.fetchedAt.getTime();
    log.debug("intel.cache.hit", { domain, ageMs, ms: done() });
    return {
      intel,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      ageMs,
    };
  } catch (err) {
    log.warn("intel.cache.read_failed", { domain, error: (err as Error).message });
    return null;
  }
}

export async function writeIntelCache(domain: string, intel: DomainIntel): Promise<void> {
  try {
    const db = getDb();
    const ttlMs = chooseTtl(intel);
    const expiresAt = new Date(Date.now() + ttlMs);
    await db
      .insert(domainIntelCache)
      .values({
        domain,
        intel: intel as unknown as Record<string, unknown>,
        registered: intel.registered,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: domainIntelCache.domain,
        set: {
          intel: intel as unknown as Record<string, unknown>,
          registered: intel.registered,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
    log.debug("intel.cache.write", { domain, ttlMs });
  } catch (err) {
    log.warn("intel.cache.write_failed", { domain, error: (err as Error).message });
  }
}

/**
 * Forcibly drop a cache entry. Used by the watch system when it detects a
 * status change so the next read picks up the new state immediately.
 */
export async function invalidateIntelCache(domain: string): Promise<void> {
  try {
    const db = getDb();
    await db.delete(domainIntelCache).where(eq(domainIntelCache.domain, domain));
  } catch (err) {
    log.warn("intel.cache.invalidate_failed", { domain, error: (err as Error).message });
  }
}

function chooseTtl(intel: DomainIntel): number {
  if (intel.sources.length === 0) return ERROR_TTL;

  if (!intel.registered) return UNREGISTERED_TTL;

  const status = (intel.status ?? []).join(" ").toLowerCase();
  if (
    status.includes("pendingdelete") ||
    status.includes("redemption") ||
    status.includes("clienthold") ||
    status.includes("expired")
  ) {
    return PENDING_OR_EXPIRED_TTL;
  }

  // Approaching expiry → shorter TTL
  if (intel.expires) {
    const expiresMs = new Date(intel.expires).getTime();
    if (!Number.isNaN(expiresMs)) {
      const daysUntilExpiry = (expiresMs - Date.now()) / (24 * 60 * 60 * 1000);
      if (daysUntilExpiry < 30) return PENDING_OR_EXPIRED_TTL;
    }
  }

  const hasFullData = Boolean(intel.registrar && intel.created && intel.expires);
  return hasFullData ? REGISTERED_FULL_TTL : REGISTERED_PARTIAL_TTL;
}
