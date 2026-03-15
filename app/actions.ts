"use server";

import { headers } from "next/headers";
import { fetchRdapDetails } from "@/app/lib/domain-scraper";
import { fetchDomainIntel } from "@/app/lib/domain-intel";
import type { DomainIntel } from "@/app/lib/domain-intel";
import { createWatch, verifyWatch, unsubscribeWatch, getWatchesByEmail } from "@/app/lib/watch/store";
import { checkRateLimit } from "@/app/lib/watch/rate-limit";
import { sendVerificationEmail } from "@/app/lib/watch/notify";
import type { DomainWatch, WatchStatus } from "@/app/lib/watch/types";

export interface DomainIntelResult {
  success: boolean;
  domain: string;
  intel?: DomainIntel;
  error?: string;
}

export async function fetchDomainIntelAction(domain: string): Promise<DomainIntelResult> {
  if (!domain || domain.trim().length === 0) {
    return { success: false, domain, error: "Please enter a domain name" };
  }

  const d = domain.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/.test(d)) {
    return { success: false, domain: d, error: "Invalid domain name" };
  }

  try {
    const intel = await fetchDomainIntel(d);
    return { success: true, domain: d, intel };
  } catch (error) {
    console.error("[DomainIntel] failed:", error);
    return {
      success: false,
      domain: d,
      error: error instanceof Error ? error.message : "Failed to fetch domain intelligence",
    };
  }
}

// ─── Domain Watch Actions ────────────────────────────────────────────────────

export interface WatchResult {
  success: boolean;
  error?: string;
}

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function watchDomainAction(
  email: string,
  domain: string,
): Promise<WatchResult> {
  const d = domain.trim().toLowerCase();
  const e = email.trim().toLowerCase();

  if (!EMAIL_RE.test(e)) return { success: false, error: "Invalid email address" };
  if (!DOMAIN_RE.test(d)) return { success: false, error: "Invalid domain name" };

  try {
    // Check DB + email are configured
    if (!process.env.DATABASE_URL) {
      return { success: false, error: "Domain watch is not configured yet" };
    }
    if (!process.env.BREVO_API_KEY) {
      return { success: false, error: "Email service is not configured yet" };
    }

    // Rate limit
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimit(ip, e, d);
    if (!rl.ok) return { success: false, error: rl.error };

    // Fetch initial RDAP to get expiry date for scheduling
    let expiresAt: string | null = null;
    let initialStatus: WatchStatus = "registered";
    try {
      const rdap = await fetchRdapDetails(d);
      if (rdap?.expires) expiresAt = rdap.expires;
      if (!rdap) initialStatus = "unknown";
    } catch {
      // RDAP failure is non-fatal — we'll get expiry on first check
    }

    const { verifyToken } = await createWatch(d, e, expiresAt, initialStatus);
    await sendVerificationEmail(e, verifyToken, d);

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create watch";
    // "already watching" is not an error from the user's perspective
    if (msg.includes("already watching")) return { success: false, error: msg };
    console.error("[Watch] create failed:", err);
    return { success: false, error: msg };
  }
}

export async function verifyWatchAction(token: string): Promise<WatchResult & { domain?: string }> {
  if (!token) return { success: false, error: "Missing verification token" };

  try {
    const watch = await verifyWatch(token);
    if (!watch) return { success: false, error: "Invalid or expired verification link" };
    return { success: true, domain: watch.domain };
  } catch (err) {
    console.error("[Watch] verify failed:", err);
    return { success: false, error: "Verification failed" };
  }
}

export async function unwatchDomainAction(token: string): Promise<WatchResult> {
  if (!token) return { success: false, error: "Missing unsubscribe token" };

  try {
    const ok = await unsubscribeWatch(token);
    if (!ok) return { success: false, error: "Invalid or expired unsubscribe link" };
    return { success: true };
  } catch (err) {
    console.error("[Watch] unsubscribe failed:", err);
    return { success: false, error: "Failed to remove watch" };
  }
}

export async function getWatchesAction(email: string): Promise<{ success: boolean; watches: DomainWatch[]; error?: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { success: false, watches: [], error: "Invalid email" };

  try {
    const watches = await getWatchesByEmail(e);
    return { success: true, watches };
  } catch (err) {
    console.error("[Watch] list failed:", err);
    return { success: false, watches: [], error: "Failed to fetch watches" };
  }
}
