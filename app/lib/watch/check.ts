/**
 * Domain check logic — two-tier approach for efficiency.
 *
 * Tier 1: DNS-over-HTTPS (~50ms, free)
 *   If DNS resolves → domain still active, skip Tier 2.
 *   If NXDOMAIN → might be available, proceed to Tier 2.
 *   If nameservers changed → something happened, proceed to Tier 2.
 *
 * Tier 2: Full intel pipeline (RDAP + WHOIS port-43 fallback, ~500ms-2s)
 *   Works for all TLDs including RDAP-less ones (.sh/.io/.ac/.ws).
 *   Skips the cache so we always get a fresh read for watch state.
 *
 * ~90% of checks complete in Tier 1 only.
 */

import { fetchDomainIntel, probeDns } from "../domain-intel";
import { invalidateIntelCache } from "../intel-cache";
import type { WatchStatus } from "./types";

export interface CheckResult {
  status: WatchStatus;
  nameservers: string[];
  expiresAt: string | null;
  changed: boolean;
}

export async function checkDomain(
  domain: string,
  previousNameservers: string[],
  previousStatus: WatchStatus,
): Promise<CheckResult> {
  // Tier 1: Quick DNS probe
  const dns = await probeDns(domain);

  const nsChanged =
    dns.nameservers.length > 0 &&
    previousNameservers.length > 0 &&
    JSON.stringify([...dns.nameservers].sort()) !== JSON.stringify([...previousNameservers].sort());

  // If DNS resolves and nameservers haven't changed, domain is still active
  if (dns.resolves && !nsChanged && previousStatus === "registered") {
    return {
      status: "registered",
      nameservers: dns.nameservers.length > 0 ? dns.nameservers : previousNameservers,
      expiresAt: null, // Don't update — use cached expiry
      changed: false,
    };
  }

  // Tier 2: Something changed — fresh full-intel check via the layered pipeline
  // (RDAP for TLDs that support it, WHOIS port-43 otherwise, who.is as last resort).
  // Skip the read cache so the watch system always sees current state. Also blow
  // away any stale cache entry so user-facing queries pick up the change.
  const intel = await fetchDomainIntel(domain, { skipCache: true, skipPersist: true });
  void invalidateIntelCache(domain);

  const hasRegistrationData = Boolean(
    intel.registrar || intel.created || intel.expires || (intel.status && intel.status.length),
  );

  if (!hasRegistrationData) {
    // Pipeline returned nothing — if DNS also says NXDOMAIN, domain is likely available
    if (!dns.resolves && !intel.registered) {
      return {
        status: "available",
        nameservers: [],
        expiresAt: null,
        changed: previousStatus !== "available",
      };
    }
    // DNS resolves but registration sources failed — keep previous status
    return {
      status: previousStatus,
      nameservers: dns.nameservers.length > 0 ? dns.nameservers : previousNameservers,
      expiresAt: null,
      changed: false,
    };
  }

  // Determine status from intel
  let status: WatchStatus = "registered";
  const statuses = intel.status ?? [];

  if (statuses.some((s) => s.toLowerCase().includes("pendingdelete"))) {
    status = "pendingDelete";
  } else if (statuses.some((s) => s.toLowerCase().includes("redemption"))) {
    status = "pendingDelete"; // Treat redemption as pending delete
  } else if (intel.expires) {
    const expiry = new Date(intel.expires).getTime();
    if (!isNaN(expiry) && expiry < Date.now()) {
      status = "expired";
    }
  }

  return {
    status,
    nameservers: (intel.nameservers && intel.nameservers.length > 0)
      ? intel.nameservers
      : dns.nameservers.length > 0
        ? dns.nameservers
        : previousNameservers,
    expiresAt: intel.expires ?? null,
    changed: status !== previousStatus || nsChanged,
  };
}
