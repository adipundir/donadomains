/**
 * Domain Valuation — Gemini-powered domain value estimation with DB caching.
 *
 * Flow: check DB cache → if miss, call Gemini → store result → return.
 * Cache entries never expire automatically (domains don't change value fast).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { domainValuations } from "./schema";

// ─── Public types ────────────────────────────────────────────────────────────

export interface ValuationFactor {
  label: string;
  impact: "positive" | "negative" | "neutral";
  detail: string;
}

export interface DomainValuation {
  score: number;
  tier: "common" | "decent" | "premium" | "ultra";
  estimatedValue: string;
  reasoning: string;
  factors: ValuationFactor[];
  cached: boolean;
}

export interface ValuationInput {
  domain: string;
  registered: boolean;
  isPremium?: boolean;
  registrationPrice?: number;
  created?: string;
  expires?: string;
  registrar?: string;
  nameservers?: string[];
  dnsResolves?: boolean;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Get a domain valuation — checks DB cache first, falls back to Gemini.
 */
export async function valuateDomain(input: ValuationInput): Promise<DomainValuation> {
  const domain = input.domain.toLowerCase().trim();

  // 1. Check cache
  const cached = await getCachedValuation(domain);
  if (cached) return cached;

  // 2. Call Gemini
  const valuation = await callGemini(input);

  // 3. Store in DB (fire-and-forget)
  storeValuation(domain, valuation).catch(() => {});

  return valuation;
}

// ─── DB cache ────────────────────────────────────────────────────────────────

async function getCachedValuation(domain: string): Promise<DomainValuation | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(domainValuations)
      .where(eq(domainValuations.domain, domain))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      score: row.score,
      tier: row.tier,
      estimatedValue: row.estimatedValue,
      reasoning: row.reasoning,
      factors: row.factors,
      cached: true,
    };
  } catch (err) {
    console.log(`[Valuation] Cache read failed for ${domain}: ${(err as Error).message}`);
    return null;
  }
}

async function storeValuation(domain: string, valuation: DomainValuation): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(domainValuations)
      .values({
        domain,
        score: valuation.score,
        tier: valuation.tier,
        estimatedValue: valuation.estimatedValue,
        reasoning: valuation.reasoning,
        factors: valuation.factors,
      })
      .onConflictDoUpdate({
        target: domainValuations.domain,
        set: {
          score: valuation.score,
          tier: valuation.tier,
          estimatedValue: valuation.estimatedValue,
          reasoning: valuation.reasoning,
          factors: valuation.factors,
          createdAt: new Date(),
        },
      });
  } catch (err) {
    console.log(`[Valuation] Cache write failed for ${domain}: ${(err as Error).message}`);
  }
}

// ─── Gemini inference ────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.0-flash";

function buildPrompt(input: ValuationInput): string {
  const parts = [`Domain: ${input.domain}`];

  if (input.registered) parts.push("Status: Registered (taken)");
  else parts.push("Status: Available");

  if (input.isPremium) parts.push("Flagged as premium by registrars");
  if (input.registrationPrice != null) parts.push(`Registration price: $${input.registrationPrice}/yr`);
  if (input.created) parts.push(`Created: ${input.created}`);
  if (input.expires) parts.push(`Expires: ${input.expires}`);
  if (input.registrar) parts.push(`Registrar: ${input.registrar}`);
  if (input.nameservers?.length) parts.push(`Nameservers: ${input.nameservers.join(", ")}`);
  if (input.dnsResolves != null) parts.push(`DNS resolves: ${input.dnsResolves}`);

  return `You are a domain name valuation expert. Analyze the following domain and provide a valuation.

${parts.join("\n")}

Consider these factors:
- Domain length (shorter = more valuable)
- TLD value (.com is king, then .net/.org/.co, then .io/.ai/.dev, then others)
- Brandability (is it a real word? pronounceable? memorable?)
- Keyword value (does it contain high-value commercial keywords?)
- Domain age (older = more trustworthy and valuable)
- Market trends (is the industry/keyword trending?)
- Character composition (hyphens and numbers reduce value)
- Premium status from registrars

Respond with ONLY valid JSON in this exact format, no markdown:
{
  "score": <number 0-100>,
  "tier": "<common|decent|premium|ultra>",
  "estimatedValue": "<human readable price range, e.g. '$500 - $2,000' or '$50 - $200'>",
  "reasoning": "<2-3 sentence explanation of the valuation>",
  "factors": [
    {"label": "<short factor name>", "impact": "<positive|negative|neutral>", "detail": "<1 sentence explanation>"}
  ]
}

Tier guide: common (0-30), decent (31-55), premium (56-80), ultra (81-100).
Include 3-6 factors. Be realistic — most domains are worth $10-$500.`;
}

async function callGemini(input: ValuationInput): Promise<DomainValuation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = buildPrompt(input);
  const t0 = Date.now();

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const elapsed = Date.now() - t0;

  console.log(`[Valuation] Gemini responded in ${elapsed}ms for ${input.domain}`);

  // Parse JSON from response — strip markdown fences if present
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      score: number;
      tier: string;
      estimatedValue: string;
      reasoning: string;
      factors: ValuationFactor[];
    };

    // Validate and clamp
    const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    const validTiers = ["common", "decent", "premium", "ultra"] as const;
    const tier = validTiers.includes(parsed.tier as typeof validTiers[number])
      ? (parsed.tier as typeof validTiers[number])
      : score <= 30 ? "common" : score <= 55 ? "decent" : score <= 80 ? "premium" : "ultra";

    return {
      score,
      tier,
      estimatedValue: parsed.estimatedValue || "Unknown",
      reasoning: parsed.reasoning || "No reasoning provided.",
      factors: Array.isArray(parsed.factors) ? parsed.factors.slice(0, 6) : [],
      cached: false,
    };
  } catch (err) {
    console.log(`[Valuation] Failed to parse Gemini response for ${input.domain}: ${(err as Error).message}`);
    console.log(`[Valuation] Raw response: ${cleaned.slice(0, 200)}`);
    throw new Error("Failed to parse valuation response");
  }
}
