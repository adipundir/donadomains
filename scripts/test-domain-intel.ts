/**
 * Test domain intelligence for a single domain.
 * Run: npx tsx scripts/test-domain-intel.ts [domain]
 *      npx tsx scripts/test-domain-intel.ts [domain] --dns-only  (fast DNS probe only)
 */
import "dotenv/config";
import { fetchDomainIntel, probeDns } from "../app/lib/domain-intel";

async function main() {
  const domain = process.argv[2] || "google.com";
  const dnsOnly = process.argv.includes("--dns-only");

  if (dnsOnly) {
    console.log(`\n━━━ DNS Probe: ${domain} ━━━\n`);
    const t0 = Date.now();
    const probe = await probeDns(domain);
    console.log(`Resolves:     ${probe.resolves}`);
    console.log(`Nameservers:  ${probe.nameservers.join(", ") || "—"}`);
    console.log(`Time:         ${Date.now() - t0}ms\n`);
    return;
  }

  console.log(`\n━━━ Domain Intelligence: ${domain} ━━━\n`);

  const t0 = Date.now();
  const intel = await fetchDomainIntel(domain);
  const totalMs = Date.now() - t0;

  console.log(`Registered:    ${intel.registered ? "Yes" : "No"}`);
  console.log(`Registrar:     ${intel.registrar ?? "—"}`);
  console.log(`Registrar URL: ${intel.registrarUrl ?? "—"}`);
  console.log(`Registrant:    ${intel.registrant ?? "—"}`);
  console.log(`Organization:  ${intel.organization ?? "—"}`);
  console.log(`Created:       ${intel.created ?? "—"}`);
  console.log(`Updated:       ${intel.updated ?? "—"}`);
  console.log(`Expires:       ${intel.expires ?? "—"}`);
  console.log(`Email:         ${intel.contactEmail ?? "—"}`);
  console.log(`Phone:         ${intel.contactPhone ?? "—"}`);
  console.log(`Address:       ${intel.contactAddress ?? "—"}`);
  console.log(`DNSSEC:        ${intel.dnssec ?? "—"}`);
  console.log(`Nameservers:   ${intel.nameservers?.join(", ") ?? "—"}`);
  console.log(`Status:        ${intel.status?.join(", ") ?? "—"}`);

  console.log(`\nSources:       ${intel.sources.join(" → ") || "none"}`);
  console.log(`Timing:`);
  for (const [src, ms] of Object.entries(intel.timing)) {
    console.log(`  ${src}: ${ms}ms`);
  }
  console.log(`  total: ${totalMs}ms`);
  console.log(`\n✓ Domain intelligence complete\n`);
}

main();
