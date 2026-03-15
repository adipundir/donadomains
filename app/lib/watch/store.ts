/**
 * Watch storage layer — Neon Postgres via Drizzle ORM.
 */

import { getDb } from "../db";
import { domainWatches, watchTokens } from "../schema";
import { eq, and, gt, count } from "drizzle-orm";
import { computeNextCheck } from "./schedule";
import type { DomainWatch, WatchStatus } from "./types";

/** Map a DB row to the DomainWatch interface used by the rest of the app. */
function toWatch(row: typeof domainWatches.$inferSelect): DomainWatch {
  return {
    id: row.id,
    email: row.email,
    domain: row.domain,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastStatus: row.lastStatus as WatchStatus,
    lastNameservers: row.lastNameservers ?? [],
    checkCount: row.checkCount,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
  };
}

export async function createWatch(
  domain: string,
  email: string,
  expiresAt: string | null,
  initialStatus: WatchStatus,
): Promise<{ watch: DomainWatch; verifyToken: string }> {
  const db = getDb();
  const d = domain.toLowerCase();
  const e = email.toLowerCase();

  // Check for existing watch
  const existing = await db
    .select({ id: domainWatches.id })
    .from(domainWatches)
    .where(and(eq(domainWatches.email, e), eq(domainWatches.domain, d)));

  if (existing.length > 0) {
    throw new Error("You already have notifications set up for this domain");
  }

  // Insert watch
  const [row] = await db
    .insert(domainWatches)
    .values({
      email: e,
      domain: d,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      lastStatus: initialStatus,
    })
    .returning();

  // Create verification token (24h)
  const verifyToken = crypto.randomUUID();
  await db.insert(watchTokens).values({
    watchId: row.id,
    token: verifyToken,
    type: "verify",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  return { watch: toWatch(row), verifyToken };
}

export async function verifyWatch(token: string): Promise<DomainWatch | null> {
  const db = getDb();

  // Find token
  const [tok] = await db
    .select()
    .from(watchTokens)
    .where(
      and(
        eq(watchTokens.token, token),
        eq(watchTokens.type, "verify"),
        gt(watchTokens.expiresAt, new Date()),
      ),
    );

  if (!tok) return null;

  // Verify the watch and schedule first check
  const [watch] = await db
    .select()
    .from(domainWatches)
    .where(eq(domainWatches.id, tok.watchId));

  if (!watch) return null;

  const nextCheck = computeNextCheck(
    watch.expiresAt?.toISOString() ?? null,
    watch.lastStatus as WatchStatus,
  );

  await db
    .update(domainWatches)
    .set({
      emailVerified: true,
      nextCheckAt: nextCheck === Infinity ? null : new Date(nextCheck),
    })
    .where(eq(domainWatches.id, tok.watchId));

  // Delete used token
  await db.delete(watchTokens).where(eq(watchTokens.id, tok.id));

  return toWatch({ ...watch, emailVerified: true });
}

export async function getWatch(id: string): Promise<DomainWatch | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(domainWatches)
    .where(eq(domainWatches.id, id));

  return row ? toWatch(row) : null;
}

export async function getWatchesByEmail(email: string): Promise<DomainWatch[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(domainWatches)
    .where(eq(domainWatches.email, email.toLowerCase()));

  return rows.map(toWatch);
}

export async function deleteWatch(id: string): Promise<void> {
  const db = getDb();
  // Tokens cascade-delete automatically via FK constraint
  await db.delete(domainWatches).where(eq(domainWatches.id, id));
}

/** Unsubscribe via signed token (from email link). */
export async function unsubscribeWatch(token: string): Promise<boolean> {
  const db = getDb();

  const [tok] = await db
    .select()
    .from(watchTokens)
    .where(
      and(
        eq(watchTokens.token, token),
        eq(watchTokens.type, "unsubscribe"),
        gt(watchTokens.expiresAt, new Date()),
      ),
    );

  if (!tok) return false;

  await deleteWatch(tok.watchId);
  return true;
}

/** Count watches for a specific email (for rate limiting). */
export async function countWatchesByEmail(email: string): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(domainWatches)
    .where(eq(domainWatches.email, email.toLowerCase()));
  return value;
}

/** Count watchers for a specific domain (for rate limiting). */
export async function countWatchersByDomain(domain: string): Promise<number> {
  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(domainWatches)
    .where(eq(domainWatches.domain, domain.toLowerCase()));
  return value;
}
