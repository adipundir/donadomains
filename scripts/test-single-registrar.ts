/**
 * Test a single registrar and dump raw markdown + parsed results.
 *
 * Usage:
 *   npx tsx scripts/test-single-registrar.ts porkbun coolstartup
 *   npx tsx scripts/test-single-registrar.ts godaddy myshop
 *   npx tsx scripts/test-single-registrar.ts --all coolstartup   # test all sequentially
 */
import "dotenv/config";
import { ALL_REGISTRARS } from "../app/lib/registrars";

async function testRegistrar(name: string, query: string) {
  const reg = ALL_REGISTRARS.find(
    (r) => r.name.toLowerCase() === name.toLowerCase()
  );
  if (!reg) {
    console.error(`Unknown registrar: ${name}`);
    console.error(`Available: ${ALL_REGISTRARS.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${reg.name} — query: "${query}"`);
  console.log(`${"═".repeat(70)}\n`);

  const start = Date.now();
  const result = await reg.searchDomains(query);
  const elapsed = Date.now() - start;

  console.log(`\nTime: ${elapsed}ms | Hits: ${result.hits.length} | Error: ${result.error ?? "none"}\n`);

  if (result.hits.length === 0) {
    console.log("No hits. Check raw markdown above (set DEBUG_SCRAPE=1).");
    return;
  }

  // Categorize
  const avail = result.hits.filter((h) => h.available && !h.premium);
  const taken = result.hits.filter((h) => !h.available && !h.premium);
  const premium = result.hits.filter((h) => h.premium);

  console.log(`Available: ${avail.length} | Taken: ${taken.length} | Premium: ${premium.length}\n`);

  // Print all available
  console.log("─ AVAILABLE ─");
  for (const h of avail.slice(0, 20)) {
    console.log(
      `  ${h.domain.padEnd(35)} $${h.registration?.toFixed(2) ?? "?"}/yr` +
        (h.renewal ? `  (renews $${h.renewal.toFixed(2)})` : "")
    );
  }
  if (avail.length > 20) console.log(`  ... and ${avail.length - 20} more`);

  // Print taken
  if (taken.length > 0) {
    console.log("\n─ TAKEN ─");
    for (const h of taken.slice(0, 5)) {
      console.log(`  ${h.domain}${h.explicitlyTaken ? " (explicit)" : ""}`);
    }
  }

  // Print premium
  if (premium.length > 0) {
    console.log("\n─ PREMIUM ─");
    for (const h of premium.slice(0, 10)) {
      console.log(`  ${h.domain.padEnd(35)} $${h.registration?.toFixed(2) ?? "?"}`);
    }
    if (premium.length > 10) console.log(`  ... and ${premium.length - 10} more`);
  }

  // Warnings
  const warnings: string[] = [];
  for (const h of result.hits) {
    if (h.available && h.registration == null) warnings.push(`${h.domain}: available but no price`);
    if (h.registration != null && h.registration <= 0) warnings.push(`${h.domain}: price $${h.registration} <= 0`);
    if (h.registration != null && h.registration > 500 && !h.premium) warnings.push(`${h.domain}: $${h.registration} NOT flagged premium`);
    if (h.explicitlyTaken && h.available) warnings.push(`${h.domain}: explicitly taken but marked available`);
  }
  if (warnings.length > 0) {
    console.log(`\n⚠ WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  ${w}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/test-single-registrar.ts <registrar|--all> <query>");
    process.exit(1);
  }

  const [name, query] = args;

  if (name === "--all") {
    for (const reg of ALL_REGISTRARS) {
      await testRegistrar(reg.name, query);
    }
  } else {
    await testRegistrar(name, query);
  }
}

main().catch(console.error);
