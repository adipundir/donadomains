/**
 * Test individual registrar fetchers.
 * Run: npx tsx scripts/test-registrars.ts [domain]
 *
 * Shows detailed logs from each registrar module and the final pricing.
 */
import "dotenv/config";
import { preloadAllPricing, getBuyLinks } from "../app/lib/registrars";

async function main() {
  const domain = process.argv[2] || "donadomains.com";

  console.log(`\n========== Testing registrar pricing for ${domain} ==========\n`);
  console.log("Environment:");
  console.log("  GODADDY_API_KEY:", process.env.GODADDY_API_KEY ? "✓ set" : "✗ not set");
  console.log("  GODADDY_API_SECRET:", process.env.GODADDY_API_SECRET ? "✓ set" : "✗ not set");
  console.log("  NAMECHEAP_API_USER:", process.env.NAMECHEAP_API_USER ? "✓ set" : "✗ not set");
  console.log("  NAMECHEAP_API_KEY:", process.env.NAMECHEAP_API_KEY ? "✓ set" : "✗ not set");
  console.log("  NAMECHEAP_API_IP:", process.env.NAMECHEAP_API_IP ? "✓ set" : "✗ not set");
  console.log("");

  const fetchResults = await preloadAllPricing();
  console.log("\n── Fetch Summary ──");
  for (const r of fetchResults) {
    console.log(`  ${r.registrar}: ${r.source.toUpperCase()} (${r.tldCount} TLDs, ${r.fetchTimeMs}ms)${r.error ? ` — ${r.error}` : ""}`);
  }

  console.log(`\n── Pricing for ${domain} ──`);
  const links = getBuyLinks(domain, true);
  for (const link of links) {
    const cheapest = link.isCheapest ? " ★ CHEAPEST" : "";
    const renewal = link.renewalPrice ? ` (renew: ${link.renewalPrice})` : "";
    console.log(`  ${link.name.padEnd(12)} ${(link.price ?? "N/A").padEnd(12)} ${link.source.padEnd(7)}${renewal}${cheapest}`);
  }

  console.log("\n========== Done ==========\n");
}

main().catch(console.error);
