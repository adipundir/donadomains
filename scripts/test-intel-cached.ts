/**
 * End-to-end test: fetch domain intel, verify cache hit on second call,
 * and check the new pipeline returns data for RDAP-less ccTLDs.
 *
 *   npx tsx scripts/test-intel-cached.ts                     # defaults
 *   npx tsx scripts/test-intel-cached.ts ad402.sh github.io  # specific
 *   npx tsx scripts/test-intel-cached.ts --no-cache ad402.sh # bypass cache
 */

import "dotenv/config";
import { fetchDomainIntelWithMeta } from "../app/lib/domain-intel";
import { invalidateIntelCache } from "../app/lib/intel-cache";

const DEFAULTS = ["ad402.sh", "github.io", "openai.com"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noCache = args.includes("--no-cache");
  const domains = args.filter((a) => !a.startsWith("--"));
  const targets = domains.length > 0 ? domains : DEFAULTS;

  for (const domain of targets) {
    console.log(`\n══ ${domain} ══════════════════════════════════`);

    if (noCache) await invalidateIntelCache(domain);

    // First call — cold cache (probably miss)
    let t0 = Date.now();
    const first = await fetchDomainIntelWithMeta(domain, { skipCache: noCache });
    const firstMs = Date.now() - t0;
    console.log(`\n[1st call] ${firstMs}ms — cache=${first.cacheHit ? "HIT" : "MISS"} (age=${first.ageMs}ms)`);
    console.log(`  sources:   ${first.intel.sources.join(", ") || "(none)"}`);
    console.log(`  layer ms:  ${JSON.stringify(first.intel.timing)}`);
    console.log(`  registered:${first.intel.registered}`);
    if (first.intel.registrar) console.log(`  registrar: ${first.intel.registrar}`);
    if (first.intel.created) console.log(`  created:   ${first.intel.created}`);
    if (first.intel.expires) console.log(`  expires:   ${first.intel.expires}`);
    if (first.intel.status?.length) console.log(`  status:    ${first.intel.status.join(", ")}`);
    if (first.intel.nameservers?.length)
      console.log(`  ns:        ${first.intel.nameservers.slice(0, 3).join(", ")}`);

    if (noCache) continue;

    // Wait a tick to let the write-through cache settle
    await new Promise((r) => setTimeout(r, 200));

    // Second call — should be cached
    t0 = Date.now();
    const second = await fetchDomainIntelWithMeta(domain);
    const secondMs = Date.now() - t0;
    console.log(`\n[2nd call] ${secondMs}ms — cache=${second.cacheHit ? "HIT ✓" : "MISS ✗"} (age=${second.ageMs}ms)`);
    if (!second.cacheHit) {
      console.log("  ✗ Expected cache hit on second call");
    } else {
      const speedup = firstMs > 0 ? (firstMs / Math.max(secondMs, 1)).toFixed(1) : "∞";
      console.log(`  ✓ ${speedup}× faster from cache`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
