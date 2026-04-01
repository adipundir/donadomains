/**
 * Paid domain search endpoint (x402-protected).
 * Same logic as /api/search, but requires Starknet payment.
 * No rate limiting — payment itself is the access control.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { ALL_REGISTRARS } from "@/app/lib/registrars";
import type { RegistrarSearchHit } from "@/app/lib/registrars";
import {
  parseKeyword,
  buildSearchResults,
} from "@/app/lib/domain-scraper";
import type { SourceStatus } from "@/app/lib/domain-scraper";

const REGISTRAR_TIMEOUT_MS = 20_000;

async function runRegistrar(
  registrar: (typeof ALL_REGISTRARS)[number],
  baseName: string,
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
    return { name: registrar.name, status: "failed", count: 0, durationMs: elapsed, error: (err as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json(
      { error: "Missing q parameter", example: "/api/paid/search?q=example" },
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

  // No rate limiting — x402 payment is the access control

  try {
    const domainPricingHits = new Map<string, Map<string, RegistrarSearchHit>>();
    const sourceStatuses: SourceStatus[] = [];

    await Promise.all(
      ALL_REGISTRARS.map(async (registrar) => {
        const status = await runRegistrar(registrar, baseName, domainPricingHits);
        sourceStatuses.push(status);
      }),
    );

    const results = buildSearchResults(domainPricingHits, baseName, userTld);

    return NextResponse.json({
      keyword: baseName,
      tld: userTld ?? null,
      results,
      sources: sourceStatuses,
    });
  } catch (err) {
    console.error(`[Paid API] /api/paid/search error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
