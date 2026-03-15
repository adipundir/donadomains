CREATE TABLE "domain_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"domain" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"next_check_at" timestamp,
	"last_checked_at" timestamp,
	"last_status" text DEFAULT 'unknown' NOT NULL,
	"last_nameservers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check_count" integer DEFAULT 0 NOT NULL,
	"notified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_tokens" ADD CONSTRAINT "watch_tokens_watch_id_domain_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."domain_watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_domain_unique" ON "domain_watches" USING btree ("email","domain");--> statement-breakpoint
CREATE INDEX "watches_email_idx" ON "domain_watches" USING btree ("email");--> statement-breakpoint
CREATE INDEX "watches_domain_idx" ON "domain_watches" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "watches_next_check_idx" ON "domain_watches" USING btree ("next_check_at");--> statement-breakpoint
CREATE UNIQUE INDEX "token_unique" ON "watch_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tokens_watch_id_idx" ON "watch_tokens" USING btree ("watch_id");