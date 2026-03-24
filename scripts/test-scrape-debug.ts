/**
 * Quick summary test: all registrars, show hit counts and swagswap.com status
 */
import "dotenv/config";
import { firecrawlScrape } from "../app/lib/registrars/firecrawl-client";
import { parseSearchMarkdown } from "../app/lib/registrars/parse-utils";

const QUERY = process.argv[2] || "coolstartup";

const REGISTRARS = [
  { name: "Dynadot",   url: (q: string) => `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(q)}`, buyUrl: (d: string) => `https://dynadot.com/${d}`, waitMs: 2000 },
  { name: "Name.com",  url: (q: string) => `https://www.name.com/domain/search/${encodeURIComponent(q)}`, buyUrl: (d: string) => `https://name.com/${d}`, waitMs: 2000 },
  { name: "GoDaddy",   url: (q: string) => `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(q)}`, buyUrl: (d: string) => `https://godaddy.com/${d}`, waitMs: 5000 },
  { name: "Namecheap", url: (q: string) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(q)}&currencyType=USD`, buyUrl: (d: string) => `https://namecheap.com/${d}`, waitMs: 2000 },
  { name: "Hover",     url: (q: string) => `https://www.hover.com/domains/results?q=${encodeURIComponent(q)}`, buyUrl: (d: string) => `https://hover.com/${d}`, waitMs: 5000 },
  { name: "Porkbun",   url: (q: string) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(q)}`, buyUrl: (d: string) => `https://porkbun.com/${d}`, waitMs: 5000 },
];

async function main() {
  console.log(`\nSearch: "${QUERY}"\n`);
  const t0 = Date.now();

  const results = await Promise.all(REGISTRARS.map(async (reg) => {
    const start = Date.now();
    const result = await firecrawlScrape(reg.url(QUERY), reg.waitMs);
    const elapsed = Date.now() - start;
    if (!result.success || !result.markdown) {
      return { name: reg.name, elapsed, hits: 0, available: 0, taken: 0, premium: 0, error: result.error?.slice(0, 40) };
    }
    const hits = parseSearchMarkdown(result.markdown, reg.buyUrl);
    return {
      name: reg.name,
      elapsed,
      hits: hits.length,
      available: hits.filter(h => h.available && !h.premium).length,
      taken: hits.filter(h => !h.available && !h.premium).length,
      premium: hits.filter(h => h.premium).length,
    };
  }));

  const total = Date.now() - t0;
  console.log(`${"Registrar".padEnd(12)} ${"Time".padEnd(10)} ${"Hits".padEnd(6)} ${"Avail".padEnd(7)} ${"Taken".padEnd(7)} ${"Prem".padEnd(6)} Error`);
  console.log("─".repeat(75));
  for (const r of results) {
    console.log(`${r.name.padEnd(12)} ${(r.elapsed + "ms").padEnd(10)} ${String(r.hits).padEnd(6)} ${String(r.available).padEnd(7)} ${String(r.taken).padEnd(7)} ${String(r.premium).padEnd(6)} ${"error" in r && r.error ? r.error : ""}`);
  }
  console.log("─".repeat(75));
  console.log(`Wall: ${total}ms | Available: ${results.reduce((s, r) => s + r.available, 0)} | Taken: ${results.reduce((s, r) => s + r.taken, 0)}`);
}

main().catch(console.error);
