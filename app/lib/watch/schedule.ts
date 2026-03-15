/**
 * Check scheduling — expiry-aware.
 *
 * The closer a domain is to expiring, the more frequently we check it.
 * pendingDelete gets the tightest interval (2h) since that ~5-day window
 * before it drops to the public pool is the critical window.
 */

import type { WatchStatus } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function computeNextCheck(
  expiresAt: string | null,
  status: WatchStatus,
): number {
  if (status === "available") return Infinity;
  if (status === "pendingDelete") return Date.now() + 2 * HOUR;

  if (expiresAt) {
    const daysUntilExpiry = (new Date(expiresAt).getTime() - Date.now()) / DAY;

    if (daysUntilExpiry <= 0) return Date.now() + 4 * HOUR;   // already expired
    if (daysUntilExpiry <= 7) return Date.now() + 4 * HOUR;   // expiring soon
    if (daysUntilExpiry <= 30) return Date.now() + DAY;        // within a month
    if (daysUntilExpiry <= 90) return Date.now() + 3 * DAY;   // within 3 months
    return Date.now() + 7 * DAY;                               // far out
  }

  return Date.now() + DAY;
}
