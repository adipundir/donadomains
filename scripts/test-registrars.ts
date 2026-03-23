/**
 * Test registrar pricing via the full search pipeline (scraped prices only).
 * Run: npx tsx scripts/test-registrars.ts [keyword]
 *
 * Run a search and show buy links from the first available domain.
 */
import "dotenv/config";
import { searchDomainsMultiSource } from "../app/lib/domain-scraper";

async function main() {
  const keyword = process.argv[2] || "donadomains";

  console.log(`\n========== Testing registrar search for "${keyword}" ==========\n`);

  const { results } = await searchDomainsMultiSource(keyword);
  const available = results.filter((r) => r.available);

  if (available.length === 0) {
    console.log("No available domains found. Try a different keyword.");
    console.log("\n========== Done ==========\n");
    return;
  }

  const first = available[0];
  console.log(`First available: ${first.domain}`);
  console.log(`\n── Buy links (scraped) ──`);
  for (const link of first.buyLinks ?? []) {
    const cheapest = link.isCheapest ? " ★ CHEAPEST" : "";
    console.log(`  ${link.name.padEnd(12)} ${(link.price ?? "N/A").padEnd(12)}${cheapest}`);
  }

  console.log("\n========== Done ==========\n");
}

main().catch(console.error);
