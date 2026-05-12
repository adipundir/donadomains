CREATE TABLE "domain_intel_cache" (
	"domain" text PRIMARY KEY NOT NULL,
	"intel" jsonb NOT NULL,
	"registered" boolean NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "domain_intel_expires_idx" ON "domain_intel_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE TABLE "whois_servers" (
	"tld" text PRIMARY KEY NOT NULL,
	"server" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whois_servers_expires_idx" ON "whois_servers" USING btree ("expires_at");--> statement-breakpoint
CREATE TABLE "rdap_bootstrap_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
