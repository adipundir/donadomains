/**
 * Inngest functions for domain watch checking.
 *
 * Architecture:
 *   1. A cron function runs every 10 minutes, queries DB for due watches,
 *      and fans out individual "domain/check.execute" events.
 *   2. Each check runs as its own function invocation — independent timeout,
 *      retries, and concurrency control. No 60s batch cap.
 */

import { inngest } from "./client";
import { getDb } from "@/app/lib/db";
import { domainWatches, watchTokens, rateLimits } from "@/app/lib/schema";
import { eq, and, lte, isNull, isNotNull, sql } from "drizzle-orm";
import { checkDomain } from "@/app/lib/watch/check";
import { sendAvailabilityEmail } from "@/app/lib/watch/notify";
import { computeNextCheck } from "@/app/lib/watch/schedule";
import { searchAllRegistrars, buildMergedBuyLinks } from "@/app/lib/registrars";
import type { WatchStatus } from "@/app/lib/watch/types";
import type { RegistrarSearchHit } from "@/app/lib/registrars";

// ─── Scheduler: fan out due watches ─────────────────────────────────────────

export const scheduleDomainChecks = inngest.createFunction(
  { id: "schedule-domain-checks" },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const dueWatches = await step.run("get-due-watches", async () => {
      const db = getDb();
      return db
        .select({ id: domainWatches.id })
        .from(domainWatches)
        .where(
          and(
            eq(domainWatches.emailVerified, true),
            isNotNull(domainWatches.nextCheckAt),
            lte(domainWatches.nextCheckAt, new Date()),
            isNull(domainWatches.notifiedAt),
          ),
        )
        .limit(200);
    });

    // Cleanup expired tokens and stale rate limit rows on every scheduler run.
    // These are cheap DELETEs — tiny tables, indexed on expiresAt.
    await step.run("cleanup-expired", async () => {
      const db = getDb();
      const cutoff = new Date();
      await Promise.all([
        db.delete(watchTokens).where(lte(watchTokens.expiresAt, cutoff)),
        db.delete(rateLimits).where(lte(rateLimits.expiresAt, cutoff)),
      ]);
    });

    if (dueWatches.length === 0) {
      return { checked: 0, message: "No watches due" };
    }

    // Fan out: each watch gets its own function invocation
    await step.sendEvent(
      "fan-out-checks",
      dueWatches.map((w) => ({
        name: "domain/check.execute" as const,
        data: { watchId: w.id },
      })),
    );

    return { fanOut: dueWatches.length };
  },
);

// ─── Individual domain check ────────────────────────────────────────────────

export const executeDomainCheck = inngest.createFunction(
  {
    id: "execute-domain-check",
    retries: 2,
    concurrency: { limit: 10 },
  },
  { event: "domain/check.execute" },
  async ({ event, step }) => {
    const watchId = event.data.watchId as string;

    // 1. Fetch watch
    const watch = await step.run("get-watch", async () => {
      const db = getDb();
      const rows = await db
        .select()
        .from(domainWatches)
        .where(eq(domainWatches.id, watchId));
      return rows[0] ?? null;
    });

    if (!watch || !watch.emailVerified || watch.notifiedAt) {
      return { skipped: true, reason: "inactive" };
    }

    // 2. Check domain status
    const result = await step.run("check-domain", async () => {
      try {
        const previousNs = watch.lastNameservers ?? [];
        return checkDomain(watch.domain, previousNs, watch.lastStatus as WatchStatus);
      } catch (err) {
        console.error(`[Watch ${watchId}] Domain check failed for ${watch.domain}:`, err);
        throw err;
      }
    });

    // 3. Compute next check time
    // Note: watch is JSON-serialized by Inngest steps, so dates become strings
    const watchExpiry = watch.expiresAt ? String(watch.expiresAt) : null;
    const expiresAtStr = result.expiresAt ?? watchExpiry;
    const nextCheckMs = computeNextCheck(expiresAtStr, result.status);
    const nextCheckAt = nextCheckMs === Infinity ? null : new Date(nextCheckMs);

    // 4. Update watch record
    await step.run("update-watch", async () => {
      const db = getDb();
      await db
        .update(domainWatches)
        .set({
          lastStatus: result.status,
          lastNameservers: result.nameservers,
          lastCheckedAt: new Date(),
          nextCheckAt,
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : watchExpiry ? new Date(watchExpiry) : null,
          checkCount: sql`${domainWatches.checkCount} + 1`,
        })
        .where(eq(domainWatches.id, watchId));
    });

    // 5. Notify if domain became available
    if (result.status === "available") {
      // 5a. Quick registrar search to get pricing for the email
      const cheapestPrice = await step.run("fetch-pricing", async () => {
        try {
          const searchResults = await searchAllRegistrars(watch.domain);
          const hitsMap = new Map<string, RegistrarSearchHit>();
          for (const sr of searchResults) {
            for (const hit of sr.hits) {
              if (hit.domain.toLowerCase() === watch.domain.toLowerCase() && hit.available && hit.registration != null) {
                hitsMap.set(sr.registrar, hit);
              }
            }
          }
          const buyLinks = buildMergedBuyLinks(watch.domain, hitsMap);
          const cheapest = buyLinks.find((l) => l.isCheapest);
          return cheapest?.price ? cheapest.price.replace("/yr", "") : null;
        } catch (err) {
          console.error(`[Watch ${watchId}] Pricing lookup failed for ${watch.domain}:`, err);
          return null;
        }
      });

      // 5b. Send email with pricing info
      await step.run("send-notification", async () => {
        const db = getDb();

        // Create unsubscribe token
        const unsubToken = crypto.randomUUID();
        await db.insert(watchTokens).values({
          watchId,
          token: unsubToken,
          type: "unsubscribe",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        try {
          await sendAvailabilityEmail(watch.email, watch.domain, unsubToken, cheapestPrice ?? undefined);
        } catch (err) {
          console.error(`[Watch ${watchId}] Failed to send availability email for ${watch.domain}:`, err);
          // Clean up the unsubscribe token since email didn't send
          await db.delete(watchTokens).where(eq(watchTokens.token, unsubToken));
          throw err; // Let Inngest retry the whole step
        }

        await db
          .update(domainWatches)
          .set({ notifiedAt: new Date(), nextCheckAt: null })
          .where(eq(domainWatches.id, watchId));
      });
    }

    return { checked: true, domain: watch.domain, status: result.status };
  },
);
