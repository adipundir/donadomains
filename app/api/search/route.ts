import { type NextRequest, NextResponse } from "next/server";
import { ALL_REGISTRARS } from "@/app/lib/registrars";
import type { RegistrarSearchHit } from "@/app/lib/registrars";
import {
  parseKeyword,
  buildSearchResults,
} from "@/app/lib/domain-scraper";
import type { SourceStatus } from "@/app/lib/domain-scraper";
import { getDb } from "@/app/lib/db";
import { scrapeFailures, searchLogs } from "@/app/lib/schema";

const REGISTRAR_TIMEOUT_MS = 20_000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Registrar-only search: scrape registrars in parallel, compare prices, done.
 * No DNS verification or RDAP enrichment — registrars provide availability + pricing.
 */

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const wantStream = req.nextUrl.searchParams.get("stream") === "true";

  if (!q) {
    return NextResponse.json(
      { error: "Missing q parameter", example: "/api/search?q=example" },
      { status: 400 },
    );
  }

  const { baseName, userTld } = parseKeyword(q);
  if (!baseName) {
    return NextResponse.json(
      { error: "Invalid keyword" },
      { status: 400 },
    );
  }

  console.log(`[Search] "${baseName}" (userTld=${userTld ?? "none"}, stream=${wantStream})`);

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Run a single registrar scrape. */
  async function runRegistrar(
    registrar: (typeof ALL_REGISTRARS)[number],
    hits: Map<string, Map<string, RegistrarSearchHit>>,
  ): Promise<SourceStatus> {
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        registrar.searchDomains(baseName),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), REGISTRAR_TIMEOUT_MS),
        ),
      ]);
      const elapsed = Date.now() - t0;

      if (result.error) {
        console.log(`[Search] ${registrar.name}: ${result.hits.length} hits in ${elapsed}ms (error: ${result.error})`);
        logScrapeFailure(registrar.name, baseName, result.error, elapsed);
      } else {
        console.log(`[Search] ${registrar.name}: ${result.hits.length} hits in ${elapsed}ms`);
      }

      for (const hit of result.hits) {
        const d = hit.domain.toLowerCase();
        if (!hits.has(d)) hits.set(d, new Map());
        hits.get(d)!.set(registrar.name, hit);
      }

      if (result.hits.length === 0 && result.error) {
        return { name: registrar.name, status: "failed", count: 0 };
      }
      return { name: registrar.name, status: "ok", count: result.hits.length };
    } catch (err) {
      const elapsed = Date.now() - t0;
      const errorMsg = (err as Error).message;
      console.log(`[Search] ${registrar.name}: failed in ${elapsed}ms — ${errorMsg}`);
      logScrapeFailure(registrar.name, baseName, errorMsg, elapsed);
      return { name: registrar.name, status: "failed", count: 0 };
    }
  }

  function logScrapeFailure(registrar: string, query: string, error: string, durationMs: number) {
    try {
      const db = getDb();
      db.insert(scrapeFailures)
        .values({ registrar, query, error, durationMs })
        .execute()
        .catch((e) => console.error(`[Search] Failed to log scrape failure:`, e));
    } catch {
      // DB not configured — skip logging
    }
  }

  function logSearchRequest(
    totalResults: number,
    totalDurationMs: number,
    registrarResults: Array<{ name: string; status: string; hits: number; durationMs: number; error?: string }>,
  ) {
    try {
      const db = getDb();
      db.insert(searchLogs)
        .values({ query: baseName, totalResults, totalDurationMs, registrarResults })
        .execute()
        .catch((e) => console.error(`[Search] Failed to log search:`, e));
    } catch {
      // DB not configured — skip
    }
  }

  // ── Stream response (SSE) ────────────────────────────────────────────────

  if (wantStream) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const write = (data: object) => {
          if (req.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        req.signal.addEventListener("abort", () => {
          try { controller.close(); } catch {}
        });

        const domainPricingHits = new Map<string, Map<string, RegistrarSearchHit>>();
        const sourceStatuses: SourceStatus[] = [];
        const registrarTimings: Array<{ name: string; status: string; hits: number; durationMs: number; error?: string }> = [];
        const searchStart = Date.now();

        write({
          type: "init",
          registrars: ALL_REGISTRARS.map((r) => r.name),
        });

        // Registrar scrapes — each emits a batch as it completes
        const registrarPhases = ALL_REGISTRARS.map(async (registrar) => {
          const t0 = Date.now();
          const status = await runRegistrar(registrar, domainPricingHits);
          registrarTimings.push({ name: status.name, status: status.status, hits: status.count, durationMs: Date.now() - t0 });
          sourceStatuses.push(status);

          write({
            type: "batch",
            registrar: registrar.name,
            registrarStatus: status.status,
            results: buildSearchResults(domainPricingHits, baseName, userTld),
            sourceStatuses: [...sourceStatuses],
          });
        });

        Promise.all(registrarPhases)
          .then(() => {
            write({ type: "complete" });
            logSearchRequest(domainPricingHits.size, Date.now() - searchStart, registrarTimings);
            try { controller.close(); } catch {}
          })
          .catch(() => {
            write({ type: "complete" });
            logSearchRequest(domainPricingHits.size, Date.now() - searchStart, registrarTimings);
            try { controller.close(); } catch {}
          });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  }

  // ── JSON response (default) ──────────────────────────────────────────────

  try {
    const jsonSearchStart = Date.now();
    const domainPricingHits = new Map<string, Map<string, RegistrarSearchHit>>();
    const sourceStatuses: SourceStatus[] = [];
    const jsonRegistrarTimings: Array<{ name: string; status: string; hits: number; durationMs: number; error?: string }> = [];

    // All registrar scrapes in parallel
    await Promise.all(
      ALL_REGISTRARS.map(async (registrar) => {
        const t0 = Date.now();
        const status = await runRegistrar(registrar, domainPricingHits);
        jsonRegistrarTimings.push({ name: status.name, status: status.status, hits: status.count, durationMs: Date.now() - t0 });
        sourceStatuses.push(status);
      }),
    );

    const results = buildSearchResults(domainPricingHits, baseName, userTld);

    logSearchRequest(results.length, Date.now() - jsonSearchStart, jsonRegistrarTimings);

    return NextResponse.json({
      keyword: baseName,
      tld: userTld ?? null,
      results,
      sources: sourceStatuses,
    });
  } catch (err) {
    console.error(`[API] /api/search error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
