/**
 * Test: imports ALL_REGISTRARS from the actual app and tests them.
 *
 * Usage:
 *   npx tsx scripts/test-scrape-debug.ts [query]          — test all registrars
 *   npx tsx scripts/test-scrape-debug.ts --full            — test multiple queries
 *   DEBUG_SCRAPE=1 npx tsx scripts/test-scrape-debug.ts    — show raw markdown
 */
import "dotenv/config";
import { ALL_REGISTRARS } from "../app/lib/registrars";
import type { RegistrarSearchResult, RegistrarSearchHit } from "../app/lib/registrars";

const QUERIES = ["coolstartup", "techblog", "myshop", "cryptowallet"];

interface TestResult {
  name: string;
  elapsed: number;
  hits: number;
  available: number;
  taken: number;
  premium: number;
  error?: string;
  sampleAvail: string[];
  sampleTaken: string[];
  priceRange?: string;
  hasRenewal: number;
}

function analyzeResult(name: string, result: RegistrarSearchResult, elapsed: number): TestResult {
  const avail = result.hits.filter(h => h.available && !h.premium);
  const taken = result.hits.filter(h => !h.available && !h.premium);
  const premium = result.hits.filter(h => h.premium);
  const withRenewal = result.hits.filter(h => h.renewal != null);

  const prices = result.hits
    .filter(h => h.registration != null)
    .map(h => h.registration!);

  return {
    name,
    elapsed,
    hits: result.hits.length,
    available: avail.length,
    taken: taken.length,
    premium: premium.length,
    error: result.error?.slice(0, 60),
    sampleAvail: avail.slice(0, 3).map(h => `${h.domain} ($${h.registration ?? "?"})`),
    sampleTaken: taken.slice(0, 2).map(h => h.domain),
    priceRange: prices.length > 0
      ? `$${Math.min(...prices).toFixed(2)}-$${Math.max(...prices).toFixed(2)}`
      : "none",
    hasRenewal: withRenewal.length,
  };
}

function validateHit(hit: RegistrarSearchHit, registrar: string): string[] {
  const warnings: string[] = [];
  if (!hit.domain.includes(".")) warnings.push(`${registrar}: invalid domain "${hit.domain}"`);
  if (hit.available && hit.registration == null) warnings.push(`${registrar}: ${hit.domain} available but no price`);
  if (hit.registration != null && hit.registration <= 0) warnings.push(`${registrar}: ${hit.domain} price <= 0 ($${hit.registration})`);
  if (hit.registration != null && hit.registration > 10000 && !hit.premium) warnings.push(`${registrar}: ${hit.domain} $${hit.registration} not flagged premium`);
  if (hit.explicitlyTaken && hit.available) warnings.push(`${registrar}: ${hit.domain} explicitly taken but marked available`);
  if (hit.currency !== "USD") warnings.push(`${registrar}: ${hit.domain} non-USD currency: ${hit.currency}`);
  return warnings;
}

async function testQuery(query: string): Promise<{ results: TestResult[]; warnings: string[]; wallTime: number }> {
  console.log(`\n${"═".repeat(75)}`);
  console.log(`  Search: "${query}" (${ALL_REGISTRARS.length} registrars)`);
  console.log(`${"═".repeat(75)}`);

  const t0 = Date.now();
  const allWarnings: string[] = [];

  const results = await Promise.all(ALL_REGISTRARS.map(async (reg) => {
    const start = Date.now();
    const result = await reg.searchDomains(query);
    const elapsed = Date.now() - start;

    // Validate every hit
    for (const hit of result.hits) {
      allWarnings.push(...validateHit(hit, reg.name));
    }

    return analyzeResult(reg.name, result, elapsed);
  }));

  const wallTime = Date.now() - t0;

  // Print summary table
  console.log(`\n${"Registrar".padEnd(12)} ${"Time".padEnd(10)} ${"Hits".padEnd(6)} ${"Avail".padEnd(7)} ${"Taken".padEnd(7)} ${"Prem".padEnd(6)} ${"Renewal".padEnd(8)} ${"Prices".padEnd(20)} Error`);
  console.log("─".repeat(95));
  for (const r of results) {
    console.log(
      `${r.name.padEnd(12)} ${(r.elapsed + "ms").padEnd(10)} ${String(r.hits).padEnd(6)} ` +
      `${String(r.available).padEnd(7)} ${String(r.taken).padEnd(7)} ${String(r.premium).padEnd(6)} ` +
      `${String(r.hasRenewal).padEnd(8)} ${(r.priceRange ?? "").padEnd(20)} ${r.error ?? ""}`
    );
  }
  console.log("─".repeat(95));

  const totals = results.reduce((acc, r) => ({
    avail: acc.avail + r.available,
    taken: acc.taken + r.taken,
    premium: acc.premium + r.premium,
  }), { avail: 0, taken: 0, premium: 0 });

  console.log(`Wall: ${wallTime}ms | Available: ${totals.avail} | Taken: ${totals.taken} | Premium: ${totals.premium}`);

  // Show sample results per registrar
  for (const r of results) {
    if (r.sampleAvail.length > 0) {
      console.log(`  ${r.name} samples: ${r.sampleAvail.join(", ")}`);
    }
  }

  // Check for registrar failures
  const failures = results.filter(r => r.hits === 0);
  if (failures.length > 0) {
    console.log(`\n⚠ FAILURES: ${failures.map(f => `${f.name}${f.error ? ` (${f.error})` : ""}`).join(", ")}`);
  }

  return { results, warnings: allWarnings, wallTime };
}

async function main() {
  const arg = process.argv[2];
  const isFullTest = arg === "--full";
  const queries = isFullTest ? QUERIES : [arg || "coolstartup"];

  let totalWarnings: string[] = [];
  let totalFailures = 0;
  let allResults: { query: string; results: TestResult[] }[] = [];

  for (const query of queries) {
    const { results, warnings } = await testQuery(query);
    totalWarnings.push(...warnings);
    totalFailures += results.filter(r => r.hits === 0).length;
    allResults.push({ query, results });
  }

  // Print warnings
  if (totalWarnings.length > 0) {
    console.log(`\n${"═".repeat(75)}`);
    console.log(`  DATA QUALITY WARNINGS (${totalWarnings.length})`);
    console.log(`${"═".repeat(75)}`);
    for (const w of totalWarnings.slice(0, 20)) {
      console.log(`  ⚠ ${w}`);
    }
    if (totalWarnings.length > 20) {
      console.log(`  ... and ${totalWarnings.length - 20} more`);
    }
  }

  // Final summary for multi-query tests
  if (isFullTest) {
    console.log(`\n${"═".repeat(75)}`);
    console.log(`  FINAL SUMMARY (${queries.length} queries)`);
    console.log(`${"═".repeat(75)}`);
    for (const { query, results } of allResults) {
      const working = results.filter(r => r.hits > 0).length;
      console.log(`  "${query}": ${working}/${results.length} registrars returned results`);
    }
    console.log(`\n  Total failures: ${totalFailures}`);
    console.log(`  Total warnings: ${totalWarnings.length}`);
  }

  // Exit code: fail if any registrar returned 0 hits across ALL queries
  if (isFullTest) {
    const registrarNames = ALL_REGISTRARS.map(r => r.name);
    const alwaysFailed = registrarNames.filter(name =>
      allResults.every(({ results }) => results.find(r => r.name === name)?.hits === 0)
    );
    if (alwaysFailed.length > 0) {
      console.log(`\n✗ CONSISTENTLY FAILING: ${alwaysFailed.join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\n✓ Done`);
}

main().catch(console.error);
