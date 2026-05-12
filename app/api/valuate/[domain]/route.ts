/**
 * Domain valuation endpoint — wraps `valuateDomain()` with HTTP semantics.
 *
 * Powers the MCP server's `valuate_domain` tool, but is also generally useful
 * for curl / Make / Zapier / any HTTP client. Repeat lookups hit the DB cache
 * in `app/lib/domain-valuation.ts`, so Gemini is only called the first time.
 *
 * Rate limited because Gemini calls cost money.
 */

import { type NextRequest, NextResponse } from "next/server";
import { fetchDomainIntel } from "@/app/lib/domain-intel";
import { valuateDomain } from "@/app/lib/domain-valuation";
import { checkApiRateLimit, getClientIp } from "@/app/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;
const TIMEOUT_MS = 30_000;

function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const s = v.toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

function parseNumber(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const normalized = domain.toLowerCase().trim();

  if (!DOMAIN_RE.test(normalized)) {
    return NextResponse.json(
      { error: "Invalid domain format", example: "example.com" },
      { status: 400 },
    );
  }

  const rateLimitError = await checkApiRateLimit(getClientIp(req), "valuate");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const registeredHint = parseBool(sp.get("registered"));
  const isPremium = parseBool(sp.get("isPremium"));
  const registrationPrice = parseNumber(sp.get("registrationPrice"));

  try {
    // Enrich the context with live intel (cached) — registrar, dates, etc.
    // give Gemini more to work with. Cheap because intel cache handles it.
    let intelFields: Partial<{
      registered: boolean;
      created: string;
      expires: string;
      registrar: string;
      nameservers: string[];
      dnsResolves: boolean;
    }> = {};
    try {
      const intel = await fetchDomainIntel(normalized);
      intelFields = {
        registered: intel.registered,
        created: intel.created,
        expires: intel.expires,
        registrar: intel.registrar,
        nameservers: intel.nameservers,
        dnsResolves: intel.registered,
      };
    } catch {
      // Intel failure is non-fatal — valuate with what we have.
    }

    const valuation = await Promise.race([
      valuateDomain({
        domain: normalized,
        registered: registeredHint ?? intelFields.registered ?? false,
        isPremium,
        registrationPrice,
        created: intelFields.created,
        expires: intelFields.expires,
        registrar: intelFields.registrar,
        nameservers: intelFields.nameservers,
        dnsResolves: intelFields.dnsResolves,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);

    return NextResponse.json({ domain: normalized, ...valuation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "timeout") {
      return NextResponse.json(
        { error: "Valuation timed out", domain: normalized },
        { status: 504 },
      );
    }
    console.error(`[API] /api/valuate/${normalized} error:`, err);
    return NextResponse.json({ error: "Failed to value domain" }, { status: 500 });
  }
}
