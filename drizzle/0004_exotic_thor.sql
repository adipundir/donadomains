CREATE TABLE "domain_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"score" integer NOT NULL,
	"tier" text NOT NULL,
	"estimated_value" text NOT NULL,
	"reasoning" text NOT NULL,
	"factors" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "domain_valuation_unique" ON "domain_valuations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "domain_valuations_created_at_idx" ON "domain_valuations" USING btree ("created_at");