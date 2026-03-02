/**
 * Test RDAP contact parsing for a single domain. Run: npx tsx scripts/test-rdap-contact.ts [domain]
 * Fast - only fetches RDAP, no full search or scraping.
 */
import "dotenv/config";
import { fetchRdapDetails } from "../app/lib/domain-scraper";

async function main() {
  const domain = process.argv[2] || "cloudflare.com";
  console.log("\n[Test] Fetching RDAP for:", domain, "\n");

  const reg = await fetchRdapDetails(domain);
  if (!reg) {
    console.log("No RDAP data returned (domain may be available or RDAP failed)");
    return;
  }

  console.log("Registrant:", reg.registrant ?? "—");
  console.log("Registrar:", reg.registrar ?? "—");
  console.log("Contact (combined):", reg.contact ?? "—");
  console.log("ContactEmail:", reg.contactEmail ?? "—");
  console.log("ContactPhone:", reg.contactPhone ?? "—");
  console.log("ContactAddress:", reg.contactAddress ?? "—");
  console.log("Created:", reg.created ?? "—");
  console.log("Expires:", reg.expires ?? "—");
  console.log("\n✓ RDAP contact parsing test complete");
}

main();
