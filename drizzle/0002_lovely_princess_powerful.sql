CREATE TABLE "scrape_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registrar" text NOT NULL,
	"query" text NOT NULL,
	"error" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scrape_failures_registrar_idx" ON "scrape_failures" USING btree ("registrar");--> statement-breakpoint
CREATE INDEX "scrape_failures_created_at_idx" ON "scrape_failures" USING btree ("created_at");