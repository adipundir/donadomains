import { type NextRequest, NextResponse } from "next/server";
import { fetchDomainIntelWithMeta } from "@/app/lib/domain-intel";
import { checkApiRateLimit, getClientIp } from "@/app/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;
const TIMEOUT_MS = 10_000;

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

  // Rate limit after validation — don't burn tokens on bad requests
  const rateLimitError = await checkApiRateLimit(getClientIp(req), "domain");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  try {
    const meta = await Promise.race([
      fetchDomainIntelWithMeta(normalized),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);

    return NextResponse.json(meta.intel, {
      headers: {
        "X-Cache": meta.cacheHit ? "HIT" : "MISS",
        "X-Cache-Age": String(Math.floor(meta.ageMs / 1000)),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "timeout") {
      return NextResponse.json(
        { error: "Request timed out", domain: normalized },
        { status: 504 },
      );
    }

    console.error(`[API] /api/domain/${normalized} error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
