import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Domain Watches ──────────────────────────────────────────────────────────

export const domainWatches = pgTable(
  "domain_watches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    domain: text("domain").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Domain expiry from RDAP — drives smart scheduling. */
    expiresAt: timestamp("expires_at"),
    /** Next scheduled check — Inngest reads this to decide when to run. */
    nextCheckAt: timestamp("next_check_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    lastStatus: text("last_status").default("unknown").notNull(),
    lastNameservers: jsonb("last_nameservers").$type<string[]>().default([]).notNull(),
    checkCount: integer("check_count").default(0).notNull(),
    notifiedAt: timestamp("notified_at"),
  },
  (table) => [
    uniqueIndex("email_domain_unique").on(table.email, table.domain),
    index("watches_email_idx").on(table.email),
    index("watches_domain_idx").on(table.domain),
    index("watches_next_check_idx").on(table.nextCheckAt),
  ],
);

// ─── Tokens (verification + unsubscribe) ────────────────────────────────────

export const watchTokens = pgTable(
  "watch_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchId: uuid("watch_id")
      .references(() => domainWatches.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").notNull(),
    type: text("type").$type<"verify" | "unsubscribe">().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("token_unique").on(table.token),
    index("tokens_watch_id_idx").on(table.watchId),
    index("tokens_expires_at_idx").on(table.expiresAt),
  ],
);

// ─── Rate Limits ─────────────────────────────────────────────────────────────

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").default(1).notNull(),
  windowStart: timestamp("window_start").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
