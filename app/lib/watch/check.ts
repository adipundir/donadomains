/**
 * Domain check logic — two-tier approach for efficiency.
 *
 * Tier 1: DNS-over-HTTPS (~50ms, free)
 *   If DNS resolves → domain still active, skip RDAP.
 *   If NXDOMAIN → might be available, proceed to Tier 2.
 *   If nameservers changed → something happened, proceed to Tier 2.
 *
 * Tier 2: Full RDAP (~1-3s, free but rate-limited)
 *   Confirm actual status, update expiry date.
 *
 * ~90% of checks complete in Tier 1 only.
 */

import { probeDns } from "../domain-intel";
import { fetchRdapDetails } from "../domain-scraper";
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

  // Tier 2: Something changed (NXDOMAIN, NS change, or new watch) — full RDAP check
  const rdap = await fetchRdapDetails(domain);

  if (!rdap) {
    // RDAP returned nothing — if DNS also says NXDOMAIN, domain is likely available
    if (!dns.resolves) {
      return {
        status: "available",
        nameservers: [],
        expiresAt: null,
        changed: previousStatus !== "available",
      };
    }
    // DNS resolves but RDAP failed — keep previous status
    return {
      status: previousStatus,
      nameservers: dns.nameservers.length > 0 ? dns.nameservers : previousNameservers,
      expiresAt: null,
      changed: false,
    };
  }

  // Determine status from RDAP
  let status: WatchStatus = "registered";
  const statuses = rdap.status ?? [];

  if (statuses.some((s) => s.includes("pendingDelete"))) {
    status = "pendingDelete";
  } else if (statuses.some((s) => s.includes("redemption"))) {
    status = "pendingDelete"; // Treat redemption as pending delete
  } else if (rdap.expires) {
    const expiry = new Date(rdap.expires).getTime();
    if (!isNaN(expiry) && expiry < Date.now()) {
      status = "expired";
    }
  }

  return {
    status,
    nameservers: dns.nameservers.length > 0 ? dns.nameservers : previousNameservers,
    expiresAt: rdap.expires ?? null,
    changed: status !== previousStatus || nsChanged,
  };
}
