/**
 * Structured JSON logger. Vercel ingests stdout/stderr as logs and parses
 * JSON automatically, so emitting JSON makes fields queryable.
 *
 * Levels are filterable via `LOG_LEVEL=debug|info|warn|error`. Default: info.
 *
 * Event names use dot.notation: `intel.cache_hit`, `whois.query_failed`, …
 * Keep field names stable — they become log filters in production.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = ((): LogLevel => {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
})();

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;

  const payload: Record<string, unknown> = {
    level,
    event,
    ts: new Date().toISOString(),
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      payload[k] = v instanceof Error ? { message: v.message, name: v.name } : v;
    }
  }

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};

/**
 * Simple wall-clock timer. Returns elapsed milliseconds when called.
 *
 *   const done = timer();
 *   await work();
 *   log.info("work.done", { ms: done() });
 */
export function timer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}
