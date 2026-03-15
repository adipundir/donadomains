import { type NextRequest } from "next/server";
import { ALL_REGISTRARS } from "@/app/lib/registrars";
import type { RegistrarSearchHit } from "@/app/lib/registrars";
import {
  parseKeyword,
  buildSearchResults,
  fetchRdapDetails,
  COMMON_TLDS,
} from "@/app/lib/domain-scraper";
import type { SourceStatus } from "@/app/lib/domain-scraper";
import { probeDns } from "@/app/lib/domain-intel";

const REGISTRAR_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 3_000;
const RDAP_TIMEOUT_MS = 4_000;
const MAX_RDAP_TAKEN = 8;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return new Response(JSON.stringify({ error: "Missing q parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { baseName, userTld } = parseKeyword(q);
  if (!baseName) {
    return new Response(JSON.stringify({ error: "Invalid keyword" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[Search] "${baseName}" (userTld=${userTld ?? "none"})`);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const write = (data: object) => {
        if (req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream already closed
        }
      };

      req.signal.addEventListener("abort", () => {
        try { controller.close(); } catch {}
      });

      const domainPricingHits = new Map<string, Map<string, RegistrarSearchHit>>();
      const dnsAvailability = new Map<string, boolean>();
      const sourceStatuses: SourceStatus[] = [];

      // DNS is shown as the first item in the progress bar
      write({
        type: "init",
        registrars: ["DNS", ...ALL_REGISTRARS.map((r) => r.name)],
      });

      // ── Phase 1A: DNS checks for all common TLDs ─────────────────────────
      // Fast (~200ms), runs in parallel with registrar scrapes.
      // NXDOMAIN = available. Resolves = taken.
      const dnsPhase = (async () => {
        const candidates = COMMON_TLDS.map((tld) => `${baseName}${tld}`);
        const t0 = Date.now();

        const probes = await Promise.all(
          candidates.map(async (domain) => {
            try {
              const probe = await Promise.race([
                probeDns(domain),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("dns-timeout")), DNS_TIMEOUT_MS)
                ),
              ]);
              return { domain, available: !probe.resolves };
            } catch {
              return { domain, available: null as boolean | null };
            }
          })
        );

        for (const { domain, available } of probes) {
          if (available !== null) dnsAvailability.set(domain, available);
        }

        const nAvail = [...dnsAvailability.values()].filter(Boolean).length;
        const nTaken = dnsAvailability.size - nAvail;
        console.log(`[Search] DNS done in ${Date.now() - t0}ms — ${nAvail} available, ${nTaken} taken`);

        sourceStatuses.push({ name: "DNS", status: "ok", count: dnsAvailability.size });
        write({
          type: "batch",
          registrar: "DNS",
          registrarStatus: "ok",
          results: buildSearchResults(domainPricingHits, baseName, userTld, dnsAvailability),
          sourceStatuses: [...sourceStatuses],
        });
      })();

      // ── Phase 1B: Registrar scrapes for PRICING ───────────────────────────
      // Availability signals from registrar pages are intentionally ignored —
      // DNS is the authoritative source. We only use registrar hits for pricing.
      const registrarPhases = ALL_REGISTRARS.map(async (registrar) => {
        const t0 = Date.now();
        try {
          const result = await Promise.race([
            registrar.searchDomains(baseName),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), REGISTRAR_TIMEOUT_MS)
            ),
          ]);

          console.log(`[Search] ${registrar.name}: ${result.hits.length} hits in ${Date.now() - t0}ms`);
          for (const hit of result.hits) {
            const d = hit.domain.toLowerCase();
            if (!domainPricingHits.has(d)) domainPricingHits.set(d, new Map());
            domainPricingHits.get(d)!.set(registrar.name, hit);
          }
          sourceStatuses.push({ name: registrar.name, status: "ok", count: result.hits.length });
        } catch (err) {
          console.log(`[Search] ${registrar.name}: failed in ${Date.now() - t0}ms — ${(err as Error).message}`);
          sourceStatuses.push({ name: registrar.name, status: "failed", count: 0 });
        }

        write({
          type: "batch",
          registrar: registrar.name,
          registrarStatus: sourceStatuses.find((s) => s.name === registrar.name)?.status ?? "failed",
          results: buildSearchResults(domainPricingHits, baseName, userTld, dnsAvailability),
          sourceStatuses: [...sourceStatuses],
        });
      });

      // ── Phase 2: RDAP for taken domains ──────────────────────────────────
      // After DNS + all registrar scrapes finish, fetch registration details
      // for taken domains so the UI can show registrar, expiry, owner etc.
      Promise.all([dnsPhase, ...registrarPhases])
        .then(async () => {
          const takenDomains = [...dnsAvailability.entries()]
            .filter(([, available]) => !available)
            .map(([domain]) => domain)
            .slice(0, MAX_RDAP_TAKEN);

          if (takenDomains.length > 0) {
            console.log(`[Search] RDAP: fetching details for ${takenDomains.length} taken domains`);
            await Promise.all(
              takenDomains.map(async (domain) => {
                try {
                  const rdap = await Promise.race([
                    fetchRdapDetails(domain),
                    new Promise<null>((resolve) =>
                      setTimeout(() => resolve(null), RDAP_TIMEOUT_MS)
                    ),
                  ]);
                  if (rdap) {
                    console.log(`[Search] RDAP: ${domain} — ${rdap.registrar ?? "unknown registrar"}`);
                    write({ type: "rdap_update", domain, registration: rdap });
                  }
                } catch {}
              })
            );
          }

          console.log(`[Search] Complete.`);
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
