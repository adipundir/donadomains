/**
 * Test the full domain search flow.
 * Usage: npx tsx scripts/test-search.ts [keyword]
 */
import "dotenv/config";
import { searchDomainsMultiSource } from "../app/lib/domain-scraper";

const keyword = process.argv[2] || "donataxes";

async function main() {
  console.log(`\n=== Searching for: "${keyword}" ===\n`);
  const start = Date.now();

  const { results, sourceStatuses } = await searchDomainsMultiSource(keyword);
  const elapsed = Date.now() - start;

  console.log(`\n=== Results (${elapsed}ms) ===\n`);
  console.log(`Sources: ${sourceStatuses.map((s) => `${s.name}: ${s.status} (${s.count})`).join(", ")}`);

  const available = results.filter((r) => r.available);
  const taken = results.filter((r) => !r.available);

  console.log(`\nAvailable: ${available.length} | Taken: ${taken.length} | Total: ${results.length}`);

  console.log("\n── Available Domains ──");
  for (const r of available.slice(0, 15)) {
    const prices = r.buyLinks
      ?.filter((l) => l.price)
      .map((l) => `${l.name}=${l.price}(${l.source ?? "?"})${l.isCheapest ? " ★" : ""}`)
      .join(" | ") || "no prices";
    console.log(`  ✅ ${r.domain.padEnd(30)} [${r.matchType}]`);
    console.log(`     ${prices}`);
  }
  if (available.length > 15) console.log(`  ... and ${available.length - 15} more`);

  console.log("\n── Taken Domains ──");
  for (const r of taken.slice(0, 10)) {
    const reg = r.registration;
    const details = reg ? `registrar=${reg.registrar ?? "?"}, owner=${reg.registrant ?? "?"}` : "no RDAP data";
    console.log(`  ❌ ${r.domain.padEnd(30)} [${r.matchType}] ${details}`);
  }

  console.log(`\n=== DONE in ${elapsed}ms ===\n`);
}

main().catch(console.error);
