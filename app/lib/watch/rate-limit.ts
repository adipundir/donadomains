/**
 * Rate limiting for watch creation — Postgres-backed.
 *
 *   - Per IP: max 5 watches per hour
 *   - Per email: max 10 total active watches
 *   - Per domain: max 50 total watchers
 *
 * The IP limit uses a single atomic INSERT ... ON CONFLICT DO UPDATE to avoid
 * the read-then-write race condition that would let concurrent requests bypass
 * the limit.
 */

import { getDb } from "../db";
import { rateLimits } from "../schema";
import { eq, sql } from "drizzle-orm";
import { countWatchesByEmail, countWatchersByDomain } from "./store";

const MAX_PER_IP_PER_HOUR = 5;
const MAX_WATCHES_PER_EMAIL = 10;
const MAX_WATCHERS_PER_DOMAIN = 50;

export async function checkRateLimit(
  ip: string,
  email: string,
  domain: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const ipKey = `ip:${ip}`;
  const now = new Date();
  const windowExpiry = new Date(Date.now() + 60 * 60 * 1000);

  // Atomic upsert: insert a new window or increment an existing one.
  // The CASE expression resets the window if it has expired, avoiding a
  // separate read — no race condition possible.
  const [result] = await db
    .insert(rateLimits)
    .values({ key: ipKey, count: 1, windowStart: now, expiresAt: windowExpiry })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE
          WHEN ${rateLimits.expiresAt} <= now()
          THEN 1
          ELSE ${rateLimits.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN ${rateLimits.expiresAt} <= now()
          THEN now()
          ELSE ${rateLimits.windowStart}
        END`,
        expiresAt: sql`CASE
          WHEN ${rateLimits.expiresAt} <= now()
          THEN now() + interval '1 hour'
          ELSE ${rateLimits.expiresAt}
        END`,
      },
    })
    .returning({ count: rateLimits.count });

  if (result.count > MAX_PER_IP_PER_HOUR) {
    return { ok: false, error: "Too many requests. Try again in an hour." };
  }

  // Email limit — total active watches
  const emailCount = await countWatchesByEmail(email);
  if (emailCount >= MAX_WATCHES_PER_EMAIL) {
    return { ok: false, error: `Maximum ${MAX_WATCHES_PER_EMAIL} watches per email.` };
  }

  // Domain limit — total watchers
  const domainCount = await countWatchersByDomain(domain);
  if (domainCount >= MAX_WATCHERS_PER_DOMAIN) {
    return { ok: false, error: "Too many people watching this domain." };
  }

  return { ok: true };
}
