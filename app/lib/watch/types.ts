export type WatchStatus =
  | "registered"
  | "expired"
  | "pendingDelete"
  | "available"
  | "unknown";

export interface DomainWatch {
  id: string;
  email: string;
  domain: string;
  emailVerified: boolean;
  createdAt: string;
  /** Domain expiry from RDAP, used for smart scheduling. */
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastStatus: WatchStatus;
  /** Nameservers from last check, for change detection. */
  lastNameservers: string[];
  checkCount: number;
  notifiedAt: string | null;
}

export interface WatchCreateInput {
  email: string;
  domain: string;
}
