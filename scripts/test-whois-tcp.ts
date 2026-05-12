/**
 * Test the port-43 WHOIS layer end-to-end.
 *
 *   npx tsx scripts/test-whois-tcp.ts            # default test domains
 *   npx tsx scripts/test-whois-tcp.ts ad402.sh   # specific domain
 */

import "dotenv/config";
import { whoisLookup } from "../app/lib/whois";

const DEFAULT_DOMAINS = [
  "ad402.sh", // user's case — RDAP-less ccTLD
  "github.io",
  "x.com",
  "cloudflare.com",
  "openai.com",
  "denic.de",
  "nic.uk",
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const domains = args.length > 0 ? args : DEFAULT_DOMAINS;

  for (const domain of domains) {
    console.log(`\n══ ${domain} ════════════════════════════`);
    const t0 = Date.now();
    try {
      const result = await whoisLookup(domain, { timeoutMs: 5000 });
      const ms = Date.now() - t0;
      if (!result) {
        console.log(`  ✗ no data (${ms}ms)`);
        continue;
      }
      console.log(`  ✓ ${result.source}${result.referralFollowed ? " (referral)" : ""} (${ms}ms)`);
      if (result.registrar) console.log(`    registrar: ${result.registrar}`);
      if (result.created) console.log(`    created:   ${result.created}`);
      if (result.expires) console.log(`    expires:   ${result.expires}`);
      if (result.updated) console.log(`    updated:   ${result.updated}`);
      if (result.status?.length) console.log(`    status:    ${result.status.join(", ")}`);
      if (result.nameservers?.length) console.log(`    ns:        ${result.nameservers.slice(0, 3).join(", ")}`);
      if (result.dnssec) console.log(`    dnssec:    ${result.dnssec}`);
      if (result.contactEmail) console.log(`    email:     ${result.contactEmail}`);
    } catch (err) {
      const ms = Date.now() - t0;
      console.log(`  ✗ error in ${ms}ms: ${(err as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
