/**
 * Test registrar scrapers. Run with:
 *   npx tsx scripts/test-scrapers.ts [domain]
 *
 * GoDaddy requires BROWSERLESS_TOKEN in .env (Akamai blocks local).
 * Get a free token: https://www.browserless.io/
 */
import "dotenv/config";
import { scrapeGoDaddy, scrapeNamecheap } from "../app/lib/registrar-scrapers";

async function main() {
  const domain = process.argv[2] || "donadomains.com";
  const hasToken =
    !!process.env.BROWSERLESS_TOKEN || process.env.BROWSERLESS_URL?.includes("token=");

  console.log(`\n========== Testing scrapers for ${domain} ==========`);
  console.log("GoDaddy: BROWSERLESS_TOKEN", hasToken ? "✓ set" : "✗ NOT SET (required)");
  console.log("Namecheap: local Playwright\n");

  const t0 = Date.now();
  const godaddy = await scrapeGoDaddy(domain);
  const godaddyMs = Date.now() - t0;
  console.log(`\nGoDaddy (${godaddyMs}ms):`, godaddy ?? "null/failed");
  if (!hasToken && !godaddy?.price) {
    console.log("  → Add BROWSERLESS_TOKEN to get GoDaddy data (Akamai blocks local browser)");
  }

  const t1 = Date.now();
  const namecheap = await scrapeNamecheap(domain);
  console.log(`Namecheap (${Date.now() - t1}ms):`, namecheap ?? "null/failed");

  console.log("\n========== Done ==========\n");
}

main();
