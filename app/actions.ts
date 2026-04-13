"use server";

import { headers } from "next/headers";
import { fetchRdapDetails } from "@/app/lib/domain-scraper";
import { fetchDomainIntel } from "@/app/lib/domain-intel";
import type { DomainIntel } from "@/app/lib/domain-intel";
import { valuateDomain } from "@/app/lib/domain-valuation";
import type { DomainValuation } from "@/app/lib/domain-valuation";
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

// ─── Domain Notification Actions ─────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
}

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function notifyDomainAction(
  email: string,
  domain: string,
): Promise<ActionResult> {
  const d = domain.trim().toLowerCase();
  const e = email.trim().toLowerCase();

  if (!EMAIL_RE.test(e)) return { success: false, error: "Invalid email address" };
  if (!DOMAIN_RE.test(d)) return { success: false, error: "Invalid domain name" };

  try {
    if (!process.env.DATABASE_URL) {
      return { success: false, error: "Notifications are not configured yet" };
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
    const msg = err instanceof Error ? err.message : "Failed to set up notification";
    if (msg.includes("already")) return { success: false, error: msg };
    console.error("[Notify] create failed:", err);
    return { success: false, error: msg };
  }
}

export async function verifyNotificationAction(token: string): Promise<ActionResult & { domain?: string }> {
  if (!token) return { success: false, error: "Missing verification token" };

  try {
    const watch = await verifyWatch(token);
    if (!watch) return { success: false, error: "Invalid or expired verification link" };
    return { success: true, domain: watch.domain };
  } catch (err) {
    console.error("[Notify] verify failed:", err);
    return { success: false, error: "Verification failed" };
  }
}

export async function unsubscribeAction(token: string): Promise<ActionResult> {
  if (!token) return { success: false, error: "Missing unsubscribe token" };

  try {
    const ok = await unsubscribeWatch(token);
    if (!ok) return { success: false, error: "Invalid or expired unsubscribe link" };
    return { success: true };
  } catch (err) {
    console.error("[Notify] unsubscribe failed:", err);
    return { success: false, error: "Failed to unsubscribe" };
  }
}

export async function getNotificationsAction(email: string): Promise<{ success: boolean; watches: DomainWatch[]; error?: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { success: false, watches: [], error: "Invalid email" };

  try {
    const watches = await getWatchesByEmail(e);
    return { success: true, watches };
  } catch (err) {
    console.error("[Notify] list failed:", err);
    return { success: false, watches: [], error: "Failed to fetch notifications" };
  }
}

// ─── Domain Valuation Actions ───────────────────────────────────────────────

export interface ValuationResult {
  success: boolean;
  valuation?: DomainValuation;
  error?: string;
}

export async function valuateDomainAction(
  domain: string,
  context?: {
    registered?: boolean;
    isPremium?: boolean;
    registrationPrice?: number;
  },
): Promise<ValuationResult> {
  const d = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(d)) return { success: false, error: "Invalid domain name" };

  try {
    // Gather intel for richer valuation
    let created: string | undefined;
    let expires: string | undefined;
    let registrar: string | undefined;
    let nameservers: string[] | undefined;
    let dnsResolves: boolean | undefined;
    let registered = context?.registered ?? false;

    try {
      const intel = await fetchDomainIntel(d);
      created = intel.created;
      expires = intel.expires;
      registrar = intel.registrar;
      nameservers = intel.nameservers;
      dnsResolves = intel.registered;
      registered = intel.registered;
    } catch {
      // Intel failure is non-fatal — valuate with what we have
    }

    const valuation = await valuateDomain({
      domain: d,
      registered,
      isPremium: context?.isPremium,
      registrationPrice: context?.registrationPrice,
      created,
      expires,
      registrar,
      nameservers,
      dnsResolves,
    });

    return { success: true, valuation };
  } catch (err) {
    console.error("[Valuation] failed:", err);
    return {
      success: false,
      error: "Unable to evaluate this domain right now. Please try again later.",
    };
  }
}
