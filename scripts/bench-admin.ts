/**
 * Benchmark every admin server action against the live DB.
 *
 *   npx tsx scripts/bench-admin.ts
 *
 * Use this to figure out which call is slow.
 */
import "dotenv/config";
import { getDb } from "../app/lib/db";
import { mcpToolCalls, scrapeFailures, searchLogs } from "../app/lib/schema";
import { desc, sql, count } from "drizzle-orm";

async function time<T>(label: string, fn: () => Promise<T>): Promise<number> {
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  const rowCount = Array.isArray(result) ? result.length : "-";
  console.log(`  ${label.padEnd(36)} ${String(ms).padStart(5)}ms  rows=${rowCount}`);
  return ms;
}

async function main() {
  const db = getDb();

  console.log("\n=== Warm-up (don't count this) ===");
  await time("warm-up SELECT 1", () => db.execute(sql`SELECT 1`));

  console.log("\n=== Each admin call serially ===");
  const t1 = await time("getRecentFailures", () =>
    db.select().from(scrapeFailures).orderBy(desc(scrapeFailures.createdAt)).limit(100),
  );
  const t2 = await time("getRecentSearches", () =>
    db.select().from(searchLogs).orderBy(desc(searchLogs.createdAt)).limit(100),
  );
  const t3 = await time("getRecentMcpCalls", () =>
    db.select().from(mcpToolCalls).orderBy(desc(mcpToolCalls.createdAt)).limit(100),
  );
  const t4 = await time("getFailureStats(24h GROUP BY)", () =>
    db
      .select({
        r: scrapeFailures.registrar,
        c: count(),
        avg: sql<number>`avg(${scrapeFailures.durationMs})::int`,
      })
      .from(scrapeFailures)
      .where(sql`${scrapeFailures.createdAt} > now() - interval '24 hours'`)
      .groupBy(scrapeFailures.registrar),
  );
  const t5 = await time("getFailureStats(all-time GROUP BY)", () =>
    db
      .select({ r: scrapeFailures.registrar, c: count() })
      .from(scrapeFailures)
      .groupBy(scrapeFailures.registrar),
  );
  const t6 = await time("dailyStats q1 (web GROUP BY day)", () =>
    db
      .select({
        day: sql<string>`to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        c: count(),
      })
      .from(searchLogs)
      .where(sql`${searchLogs.createdAt} >= now() - interval '14 days'`)
      .groupBy(sql`to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD')`),
  );
  const t7 = await time("dailyStats q2 (mcp GROUP BY day,tool)", () =>
    db
      .select({
        day: sql<string>`to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        tool: mcpToolCalls.tool,
        c: count(),
      })
      .from(mcpToolCalls)
      .where(sql`${mcpToolCalls.createdAt} >= now() - interval '14 days'`)
      .groupBy(
        sql`to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        mcpToolCalls.tool,
      ),
  );
  const t8 = await time("dailyStats q3 (top-queries UNION + window)", () =>
    db.execute<{ day: string; query: string; c: number }>(
      sql`
        WITH unioned AS (
          SELECT to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD') AS day,
                 lower(${searchLogs.query}) AS query
            FROM ${searchLogs}
           WHERE ${searchLogs.createdAt} >= now() - interval '14 days'
          UNION ALL
          SELECT to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD') AS day,
                 ${mcpToolCalls.query} AS query
            FROM ${mcpToolCalls}
           WHERE ${mcpToolCalls.createdAt} >= now() - interval '14 days'
        ),
        ranked AS (
          SELECT day, query, COUNT(*)::int AS c,
                 ROW_NUMBER() OVER (PARTITION BY day ORDER BY COUNT(*) DESC, query ASC) AS rn
            FROM unioned GROUP BY day, query
        )
        SELECT day, query, c FROM ranked WHERE rn <= 5 ORDER BY day DESC, c DESC
      `,
    ),
  );

  const serial = t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8;
  console.log(`\n  serial total: ${serial}ms`);

  console.log("\n=== Promise.all of all 8 queries ===");
  const t0 = Date.now();
  await Promise.all([
    db.select().from(scrapeFailures).orderBy(desc(scrapeFailures.createdAt)).limit(100),
    db.select().from(searchLogs).orderBy(desc(searchLogs.createdAt)).limit(100),
    db.select().from(mcpToolCalls).orderBy(desc(mcpToolCalls.createdAt)).limit(100),
    db
      .select({
        r: scrapeFailures.registrar,
        c: count(),
        avg: sql<number>`avg(${scrapeFailures.durationMs})::int`,
      })
      .from(scrapeFailures)
      .where(sql`${scrapeFailures.createdAt} > now() - interval '24 hours'`)
      .groupBy(scrapeFailures.registrar),
    db
      .select({ r: scrapeFailures.registrar, c: count() })
      .from(scrapeFailures)
      .groupBy(scrapeFailures.registrar),
    db
      .select({
        day: sql<string>`to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        c: count(),
      })
      .from(searchLogs)
      .where(sql`${searchLogs.createdAt} >= now() - interval '14 days'`)
      .groupBy(sql`to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD')`),
    db
      .select({
        day: sql<string>`to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        tool: mcpToolCalls.tool,
        c: count(),
      })
      .from(mcpToolCalls)
      .where(sql`${mcpToolCalls.createdAt} >= now() - interval '14 days'`)
      .groupBy(
        sql`to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD')`,
        mcpToolCalls.tool,
      ),
    db.execute(sql`
      WITH unioned AS (
        SELECT to_char(${searchLogs.createdAt} at time zone 'UTC','YYYY-MM-DD') AS day,
               lower(${searchLogs.query}) AS query
          FROM ${searchLogs}
         WHERE ${searchLogs.createdAt} >= now() - interval '14 days'
        UNION ALL
        SELECT to_char(${mcpToolCalls.createdAt} at time zone 'UTC','YYYY-MM-DD') AS day,
               ${mcpToolCalls.query} AS query
          FROM ${mcpToolCalls}
         WHERE ${mcpToolCalls.createdAt} >= now() - interval '14 days'
      ),
      ranked AS (
        SELECT day, query, COUNT(*)::int AS c,
               ROW_NUMBER() OVER (PARTITION BY day ORDER BY COUNT(*) DESC, query ASC) AS rn
          FROM unioned GROUP BY day, query
      )
      SELECT day, query, c FROM ranked WHERE rn <= 5 ORDER BY day DESC, c DESC
    `),
  ]);
  console.log(`  Promise.all total: ${Date.now() - t0}ms`);

  console.log("\n=== Row counts ===");
  const rows = await Promise.all([
    db.select({ c: count() }).from(scrapeFailures),
    db.select({ c: count() }).from(searchLogs),
    db.select({ c: count() }).from(mcpToolCalls),
  ]);
  console.log(`  scrape_failures: ${rows[0][0].c}`);
  console.log(`  search_logs:     ${rows[1][0].c}`);
  console.log(`  mcp_tool_calls:  ${rows[2][0].c}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
