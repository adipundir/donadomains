import { type NextRequest, NextResponse } from "next/server";
import { ALL_REGISTRARS } from "@/app/lib/registrars";
import type { RegistrarSearchHit } from "@/app/lib/registrars";
import {
  parseKeyword,
  buildSearchResults,
  fetchRdapDetails,
} from "@/app/lib/domain-scraper";
import type { SourceStatus, DomainResult } from "@/app/lib/domain-scraper";
import { probeDns } from "@/app/lib/domain-intel";
import { checkApiRateLimit, getClientIp } from "@/app/lib/api-rate-limit";

const REGISTRAR_TIMEOUT_MS = 15_000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Registrar-only search: scrape registrars in parallel, compare prices, done.
 */

/** Fire-and-forget: log search + failures to DB after results are delivered. */
function logToDb(
  query: string,
  totalResults: number,
  totalDurationMs: number,
  registrarResults: Array<{ name: string; status: string; hits: number; durationMs: number; error?: string }>,
) {
  // Dynamic import so the DB module is never loaded during the search hot path
  import("@/app/lib/db").then(({ getDb }) =>
    import("@/app/lib/schema").then(({ scrapeFailures, searchLogs }) => {
      const db = getDb();

      // Log overall search
      db.insert(searchLogs)
        .values({ query, totalResults, totalDurationMs, registrarResults })
        .execute()
        .catch(() => {});

      // Log individual failures
      for (const r of registrarResults) {
        if (r.status === "failed" && r.error) {
          db.insert(scrapeFailures)
            .values({ registrar: r.name, query, error: r.error, durationMs: r.durationMs })
            .execute()
            .catch(() => {});
        }
      }
    })
  ).catch(() => {});
}

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

  // Rate limit after validation — don't burn tokens on bad requests
  const rateLimitError = await checkApiRateLimit(getClientIp(req), "search");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  console.log(`[Search] "${baseName}" (userTld=${userTld ?? "none"}, stream=${wantStream})`);

  const userExactDomain = userTld ? `${baseName}${userTld}` : null;

  /**
   * When the user searches an exact domain (e.g. "donadomains.hh") and no
   * registrar returned it, probe DNS + RDAP to check if it's registered.
   * Returns a DomainResult to inject at the top, or null.
   */
  async function probeUserDomain(
    domainPricingHits: Map<string, Map<string, RegistrarSearchHit>>,
  ): Promise<DomainResult | null> {
    if (!userExactDomain) return null;
    if (domainPricingHits.has(userExactDomain)) return null;

    console.log(`[Search] No registrar returned ${userExactDomain} — probing DNS + RDAP`);
    const [dns, rdap] = await Promise.allSettled([
      probeDns(userExactDomain),
      fetchRdapDetails(userExactDomain),
    ]);

    const dnsResult = dns.status === "fulfilled" ? dns.value : null;
    const rdapResult = rdap.status === "fulfilled" ? rdap.value : null;
    const isRegistered = dnsResult?.resolves || rdapResult != null;

    return {
      domain: userExactDomain,
      available: !isRegistered,
      tld: userTld!,
      matchType: "exact",
      registration: isRegistered && rdapResult ? {
        registrar: rdapResult.registrar,
        created: rdapResult.created,
        expires: rdapResult.expires,
        registrant: rdapResult.registrant,
        contactEmail: rdapResult.contactEmail,
        contactPhone: rdapResult.contactPhone,
        contactAddress: rdapResult.contactAddress,
        status: rdapResult.status,
      } : undefined,
    };
  }

  /** Run a single registrar scrape. */
  async function runRegistrar(
    registrar: (typeof ALL_REGISTRARS)[number],
    hits: Map<string, Map<string, RegistrarSearchHit>>,
  ): Promise<SourceStatus & { durationMs: number; error?: string }> {
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        registrar.searchDomains(baseName),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), REGISTRAR_TIMEOUT_MS),
        ),
      ]);
      const elapsed = Date.now() - t0;
      console.log(`[Search] ${registrar.name}: ${result.hits.length} hits in ${elapsed}ms${result.error ? ` (error: ${result.error})` : ""}`);

      for (const hit of result.hits) {
        const d = hit.domain.toLowerCase();
        if (!hits.has(d)) hits.set(d, new Map());
        hits.get(d)!.set(registrar.name, hit);
      }

      if (result.hits.length === 0 && result.error) {
        return { name: registrar.name, status: "failed", count: 0, durationMs: elapsed, error: result.error };
      }
      return { name: registrar.name, status: "ok", count: result.hits.length, durationMs: elapsed };
    } catch (err) {
      const elapsed = Date.now() - t0;
      const errorMsg = (err as Error).message;
      console.log(`[Search] ${registrar.name}: failed in ${elapsed}ms — ${errorMsg}`);
      return { name: registrar.name, status: "failed", count: 0, durationMs: elapsed, error: errorMsg };
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

        const registrarPhases = ALL_REGISTRARS.map(async (registrar) => {
          const status = await runRegistrar(registrar, domainPricingHits);
          registrarTimings.push({ name: status.name, status: status.status, hits: status.count, durationMs: status.durationMs, error: status.error });
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
          .then(async () => {
            // Probe user's exact domain via DNS+RDAP if no registrar had it
            const probed = await probeUserDomain(domainPricingHits);
            if (probed) {
              const results = buildSearchResults(domainPricingHits, baseName, userTld);
              results.unshift(probed);
              write({
                type: "batch",
                registrar: "DNS/RDAP",
                registrarStatus: "ok",
                results,
                sourceStatuses: [...sourceStatuses],
              });
            }
            write({ type: "complete" });
            try { controller.close(); } catch {}
            logToDb(baseName, domainPricingHits.size, Date.now() - searchStart, registrarTimings);
          })
          .catch(() => {
            write({ type: "complete" });
            try { controller.close(); } catch {}
            logToDb(baseName, domainPricingHits.size, Date.now() - searchStart, registrarTimings);
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
    const registrarTimings: Array<{ name: string; status: string; hits: number; durationMs: number; error?: string }> = [];

    await Promise.all(
      ALL_REGISTRARS.map(async (registrar) => {
        const status = await runRegistrar(registrar, domainPricingHits);
        registrarTimings.push({ name: status.name, status: status.status, hits: status.count, durationMs: status.durationMs, error: status.error });
        sourceStatuses.push(status);
      }),
    );

    const results = buildSearchResults(domainPricingHits, baseName, userTld);

    // Probe user's exact domain via DNS+RDAP if no registrar had it
    const probed = await probeUserDomain(domainPricingHits);
    if (probed) results.unshift(probed);

    // Response goes out first, logging happens after
    const response = NextResponse.json({
      keyword: baseName,
      tld: userTld ?? null,
      results,
      sources: sourceStatuses,
    });

    logToDb(baseName, results.length, Date.now() - jsonSearchStart, registrarTimings);

    return response;
  } catch (err) {
    console.error(`[API] /api/search error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
