/**
 * API rate limiting — Postgres atomic upsert keyed by client IP.
 *
 * Per-endpoint hourly limits:
 *   - /api/search   : 20/hr  (each scrape burns 6 Firecrawl credits)
 *   - /api/domain   : 60/hr  (cheap layered lookup, cached)
 *   - /api/valuate  : 20/hr  (Gemini calls cost money)
 *   - /api/mcp      : 200/hr (overall MCP cap; per-tool limits stack)
 *
 * IPv6 addresses are normalized to their /64 prefix before being used as
 * the rate-limit key. Without this, an attacker with an IPv6 allocation
 * can trivially rotate the lower 64 bits and bypass per-IP limits.
 *
 * No cron needed — the CASE expression auto-resets expired windows on next
 * request. Stale rows accumulate but are tiny (one row per IP) and harmless.
 */

import { getDb } from "./db";
import { rateLimits } from "./schema";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  search: { max: 20, windowMs: 60 * 60 * 1000 },
  domain: { max: 60, windowMs: 60 * 60 * 1000 },
  valuate: { max: 20, windowMs: 60 * 60 * 1000 },
  mcp: { max: 200, windowMs: 60 * 60 * 1000 },
};

/**
 * Extract the client IP. Normalizes IPv6 to /64 prefix so that an attacker
 * with a /64 allocation can't rotate lower bits to bypass limits.
 * IPv4 with port (rare in XFF) gets the port stripped.
 */
export function getClientIp(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!raw) return "unknown";

  // IPv4 (optionally with :port)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(raw)) {
    return raw.split(":")[0];
  }

  // IPv6 — expand `::` shorthand to 8 hextets, then take the first 4 (=/64)
  if (raw.includes(":")) {
    const expanded = expandIpv6(raw);
    return expanded.split(":").slice(0, 4).join(":") + "::/64";
  }

  return raw;
}

function expandIpv6(ip: string): string {
  if (!ip.includes("::")) return ip;
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  return [...headParts, ...Array(missing).fill("0"), ...tailParts].join(":");
}

/**
 * Check and increment the rate limit for an API endpoint.
 * Returns null if allowed, or an error message if rate-limited.
 */
export type RateLimitEndpoint = "search" | "domain" | "valuate" | "mcp";

export async function checkApiRateLimit(
  ip: string,
  endpoint: RateLimitEndpoint,
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
