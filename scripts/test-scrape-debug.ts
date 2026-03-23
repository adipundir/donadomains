/**
 * Test: fire 6 Firecrawl requests simultaneously and log start/end times
 * to see if they actually run in parallel or get queued.
 */
import "dotenv/config";
import { firecrawlScrape } from "../app/lib/registrars/firecrawl-client";

const URLS = [
  { name: "Dynadot",   url: "https://www.dynadot.com/domain/search?domain=testparallel", waitMs: 2000 },
  { name: "Name.com",  url: "https://www.name.com/domain/search/testparallel", waitMs: 2000 },
  { name: "GoDaddy",   url: "https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=testparallel", waitMs: 5000 },
  { name: "Namecheap", url: "https://www.namecheap.com/domains/registration/results/?domain=testparallel&currencyType=USD", waitMs: 2000 },
  { name: "Hover",     url: "https://www.hover.com/domains/results?q=testparallel", waitMs: 5000 },
  { name: "Porkbun",   url: "https://porkbun.com/checkout/search?q=testparallel", waitMs: 5000 },
];

async function main() {
  const t0 = Date.now();
  console.log("Firing all 6 requests at t=0\n");

  const results = await Promise.all(URLS.map(async ({ name, url, waitMs }) => {
    const startOffset = Date.now() - t0;
    console.log(`[${String(startOffset).padStart(6)}ms] ${name} → STARTED`);
    const result = await firecrawlScrape(url, waitMs);
    const endOffset = Date.now() - t0;
    const duration = endOffset - startOffset;
    console.log(`[${String(endOffset).padStart(6)}ms] ${name} → DONE (took ${duration}ms, success=${result.success})`);
    return { name, startOffset, endOffset, duration, success: result.success };
  }));

  const total = Date.now() - t0;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${"Registrar".padEnd(12)} ${"Start".padEnd(10)} ${"End".padEnd(10)} ${"Duration".padEnd(10)} OK`);
  console.log(`${"─".repeat(60)}`);
  for (const r of results) {
    console.log(`${r.name.padEnd(12)} ${(r.startOffset + "ms").padEnd(10)} ${(r.endOffset + "ms").padEnd(10)} ${(r.duration + "ms").padEnd(10)} ${r.success}`);
  }
  console.log(`${"─".repeat(60)}`);
  console.log(`Total wall time: ${total}ms`);

  // Check overlap: if queued, we'd see sequential start times
  const sorted = [...results].sort((a, b) => a.endOffset - b.endOffset);
  console.log(`\nFirst to finish: ${sorted[0].name} at ${sorted[0].endOffset}ms`);
  console.log(`Last to finish:  ${sorted[5].name} at ${sorted[5].endOffset}ms`);

  // Count how many were running simultaneously at each completion point
  for (const r of sorted) {
    const runningAt = results.filter(x => x.startOffset <= r.endOffset && x.endOffset >= r.endOffset).length;
    console.log(`At ${r.endOffset}ms (${r.name} finished): ${runningAt} still running`);
  }
}

main().catch(console.error);
