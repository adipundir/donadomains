/**
 * Paid domain intel endpoint (x402-protected).
 * Same logic as /api/domain/[domain], but requires Starknet payment.
 * No rate limiting — payment itself is the access control.
 */
import { type NextRequest, NextResponse } from "next/server";
import { fetchDomainIntel } from "@/app/lib/domain-intel";

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

  // No rate limiting — x402 payment is the access control

  try {
    const intel = await Promise.race([
      fetchDomainIntel(normalized),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);

    return NextResponse.json(intel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "timeout") {
      return NextResponse.json(
        { error: "Request timed out", domain: normalized },
        { status: 504 },
      );
    }

    console.error(`[Paid API] /api/paid/domain/${normalized} error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
