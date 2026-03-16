import { type NextRequest, NextResponse } from "next/server";
import { ALL_REGISTRARS } from "@/app/lib/registrars";
import type { RegistrarSearchHit } from "@/app/lib/registrars";
import {
  parseKeyword,
  buildSearchResults,
  fetchRdapDetails,
} from "@/app/lib/domain-scraper";
import type { SourceStatus } from "@/app/lib/domain-scraper";
import { probeDns } from "@/app/lib/domain-intel";

const REGISTRAR_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 3_000;
const RDAP_TIMEOUT_MS = 4_000;
const MAX_RDAP_TAKEN = 8;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * New architecture: registrars drive discovery, DNS verifies, RDAP enriches.
 *
 * 1. Registrar scrapes (parallel, 2-8s) — discover domains + pricing
 * 2. DNS verification (parallel, ~200ms) — confirm available/taken for registrar-returned domains
 * 3. RDAP enrichment (parallel, ~300ms) — registration details for taken domains
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

  // ── Shared helpers ─────────────────────────────────────────────────────

  /** DNS-verify a set of domains returned by registrars. */
  async function dnsVerify(domains: string[]) {
    const availability = new Map<string, boolean>();
    const probes = await Promise.all(
      domains.map(async (domain) => {
        try {
          const probe = await Promise.race([
            probeDns(domain),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("dns-timeout")), DNS_TIMEOUT_MS),
            ),
          ]);
          return { domain, available: !probe.resolves };
        } catch {
          return { domain, available: null as boolean | null };
        }
      }),
    );

    for (const { domain, available } of probes) {
      if (available !== null) availability.set(domain, available);
    }

    console.log(`[Search] DNS verified ${availability.size} domains`);
    return availability;
  }

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
      console.log(`[Search] ${registrar.name}: ${result.hits.length} hits in ${Date.now() - t0}ms`);
      for (const hit of result.hits) {
        const d = hit.domain.toLowerCase();
        if (!hits.has(d)) hits.set(d, new Map());
        hits.get(d)!.set(registrar.name, hit);
      }
      return { name: registrar.name, status: "ok", count: result.hits.length };
    } catch (err) {
      console.log(`[Search] ${registrar.name}: failed in ${Date.now() - t0}ms — ${(err as Error).message}`);
      return { name: registrar.name, status: "failed", count: 0 };
    }
  }

  /** Fetch RDAP for taken domains. */
  async function runRdap(takenDomains: string[]) {
    const results = new Map<string, Awaited<ReturnType<typeof fetchRdapDetails>>>();
    await Promise.all(
      takenDomains.slice(0, MAX_RDAP_TAKEN).map(async (domain) => {
        try {
          const rdap = await Promise.race([
            fetchRdapDetails(domain),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), RDAP_TIMEOUT_MS),
            ),
          ]);
          if (rdap) results.set(domain, rdap);
        } catch {}
      }),
    );
    return results;
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
        const dnsAvailability = new Map<string, boolean>();
        const sourceStatuses: SourceStatus[] = [];

        write({
          type: "init",
          registrars: ALL_REGISTRARS.map((r) => r.name),
        });

        // Registrar scrapes — each emits a batch as it completes
        const registrarPhases = ALL_REGISTRARS.map(async (registrar) => {
          const status = await runRegistrar(registrar, domainPricingHits);
          sourceStatuses.push(status);

          // DNS-verify newly discovered domains from this registrar
          const newDomains = [...domainPricingHits.keys()].filter((d) => !dnsAvailability.has(d));
          if (newDomains.length > 0) {
            const dnsResults = await dnsVerify(newDomains);
            for (const [d, a] of dnsResults) dnsAvailability.set(d, a);
          }

          write({
            type: "batch",
            registrar: registrar.name,
            registrarStatus: status.status,
            results: buildSearchResults(domainPricingHits, baseName, userTld, dnsAvailability),
            sourceStatuses: [...sourceStatuses],
          });
        });

        Promise.all(registrarPhases)
          .then(async () => {
            // RDAP for taken domains after all registrars + DNS complete
            const takenDomains = [...dnsAvailability.entries()]
              .filter(([, avail]) => !avail)
              .map(([domain]) => domain);

            if (takenDomains.length > 0) {
              const rdapResults = await runRdap(takenDomains);
              for (const [domain, rdap] of rdapResults) {
                write({ type: "rdap_update", domain, registration: rdap });
              }
            }
            write({ type: "rdap_done" });
            write({ type: "complete" });
            try { controller.close(); } catch {}
          })
          .catch(() => {
            write({ type: "complete" });
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
    const domainPricingHits = new Map<string, Map<string, RegistrarSearchHit>>();
    const sourceStatuses: SourceStatus[] = [];

    // Step 1: All registrar scrapes in parallel
    await Promise.all(
      ALL_REGISTRARS.map(async (registrar) => {
        const status = await runRegistrar(registrar, domainPricingHits);
        sourceStatuses.push(status);
      }),
    );

    // Step 2: DNS-verify all discovered domains
    const allDomains = [...domainPricingHits.keys()];
    const dnsAvailability = await dnsVerify(allDomains);

    // Step 3: RDAP for taken domains
    const takenDomains = [...dnsAvailability.entries()]
      .filter(([, avail]) => !avail)
      .map(([domain]) => domain);

    const rdapResults = await runRdap(takenDomains);

    // Build final results
    const results = buildSearchResults(domainPricingHits, baseName, userTld, dnsAvailability);
    for (const result of results) {
      const rdap = rdapResults.get(result.domain);
      if (rdap) result.registration = rdap;
    }

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
