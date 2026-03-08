/**
 * Comprehensive test for the full search pipeline:
 * 1. Registrar search (Firecrawl scraping of search pages)
 * 2. RDAP availability checking
 * 3. Merged results with buy links from scraped prices
 */
import "dotenv/config";
import { searchDomainsMultiSource } from "../app/lib/domain-scraper";

const TEST_QUERY = process.argv[2] || "donataxes";

async function main() {
  console.log("=".repeat(70));
  console.log(`FULL SEARCH PIPELINE TEST — query: "${TEST_QUERY}"`);
  console.log("=".repeat(70));
  console.log();

  const startTime = Date.now();

  try {
    const { results, sourceStatuses } = await searchDomainsMultiSource(TEST_QUERY);
    const elapsed = Date.now() - startTime;

    console.log("\n" + "=".repeat(70));
    console.log("RESULTS");
    console.log("=".repeat(70));

    const available = results.filter((r) => r.available);
    const taken = results.filter((r) => !r.available);

    console.log(`\nTotal: ${results.length} domains in ${elapsed}ms`);
    console.log(`Available: ${available.length} | Taken: ${taken.length}\n`);

    console.log("--- AVAILABLE DOMAINS ---\n");
    for (const r of available) {
      const links = r.buyLinks ?? [];
      const cheapest = links.find((l) => l.isCheapest);
      const priceStr = cheapest ? `${cheapest.price} at ${cheapest.name}` : "no pricing";
      console.log(`  ${r.domain} — ${priceStr} (${r.source})`);
      if (links.length > 1) {
        for (const l of links) {
          const tag = l.isCheapest ? " [CHEAPEST]" : "";
          console.log(`    ${l.name}: ${l.price} (${l.source})${tag}`);
        }
      }
    }

    console.log("\n--- TAKEN DOMAINS ---\n");
    for (const r of taken.slice(0, 10)) {
      const reg = r.registration;
      const owner = reg?.registrant ?? "—";
      const registrar = reg?.registrar ?? "—";
      console.log(`  ${r.domain} — owner: ${owner} | registrar: ${registrar}`);
    }
    if (taken.length > 10) console.log(`  ... and ${taken.length - 10} more`);

    console.log("\n--- SOURCE STATUSES ---\n");
    for (const s of sourceStatuses) {
      const icon = s.status === "ok" ? "✓" : "✗";
      console.log(`  ${icon} ${s.name}: ${s.count} results${s.error ? ` (${s.error})` : ""}`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("TEST COMPLETE");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
