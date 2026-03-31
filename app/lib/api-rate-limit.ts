/**
 * API rate limiting — same Postgres atomic upsert as the watch system.
 *
 * Limits:
 *   - /api/search: 20 requests per hour per IP (each burns 6 Firecrawl credits)
 *   - /api/domain: 60 requests per hour per IP (cheap, just RDAP + DNS)
 *
 * No cron needed — the CASE expression auto-resets expired windows on next request.
 * Stale rows accumulate but are tiny (one row per IP) and harmless.
 */

import { getDb } from "./db";
import { rateLimits } from "./schema";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  search: { max: 20, windowMs: 60 * 60 * 1000 },   // 20/hr
  domain: { max: 60, windowMs: 60 * 60 * 1000 },    // 60/hr
};

export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Check and increment the rate limit for an API endpoint.
 * Returns null if allowed, or an error message if rate-limited.
 */
export async function checkApiRateLimit(
  ip: string,
  endpoint: "search" | "domain",
): Promise<string | null> {
  const { max, windowMs } = LIMITS[endpoint];
  const key = `api:${endpoint}:${ip}`;
  const now = new Date();
  const windowExpiry = new Date(Date.now() + windowMs);

  try {
    const db = getDb();

    const [result] = await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart: now, expiresAt: windowExpiry })
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

    if (result.count > max) {
      return `Rate limit exceeded. Maximum ${max} requests per hour.`;
    }

    return null;
  } catch (err) {
    // If DB is down, let the request through — don't break the API
    // because of a rate limit check failure
    console.error(`[RateLimit] DB error for ${key}:`, (err as Error).message);
    return null;
  }
}
