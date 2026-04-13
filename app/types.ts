/**
 * Re-export types that client components need.
 * Separated from actions.ts because "use server" modules
 * cannot have type-only exports in Turbopack.
 */

export type { DomainIntel } from "@/app/lib/domain-intel";
export type { DomainWatch } from "@/app/lib/watch/types";
export type { DomainResult, DomainRegistrationDetails, BuyLink } from "@/app/lib/domain-scraper";
export type { DomainValuation, ValuationFactor } from "@/app/lib/domain-valuation";
