CREATE TABLE "mcp_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"query" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"is_error" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_created_at_idx" ON "mcp_tool_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_tool_idx" ON "mcp_tool_calls" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "mcp_tool_calls_query_idx" ON "mcp_tool_calls" USING btree ("query");
