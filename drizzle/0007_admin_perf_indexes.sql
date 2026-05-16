-- Composite indexes for admin daily-stats GROUP BY queries.
-- `WHERE created_at >= X GROUP BY <col>` is faster with (col, created_at)
-- than with the existing single-column indexes.

CREATE INDEX IF NOT EXISTS "scrape_failures_registrar_created_at_idx"
  ON "scrape_failures" USING btree ("registrar", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tool_calls_tool_created_at_idx"
  ON "mcp_tool_calls" USING btree ("tool", "created_at");
