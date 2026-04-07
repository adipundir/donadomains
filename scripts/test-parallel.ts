import "dotenv/config";
import { ALL_REGISTRARS } from "../app/lib/registrars";

const query = process.argv[2] || "cloudpilot";

async function main() {
  console.log(`\nParallel test: "${query}" across ${ALL_REGISTRARS.length} registrars\n`);
  const globalStart = Date.now();

  const results = await Promise.all(
    ALL_REGISTRARS.map(async (r) => {
      const start = Date.now();
      try {
        const res = await r.searchDomains(query);
        const elapsed = Date.now() - start;
        return { name: r.name, elapsed, hits: res.hits.length, error: res.error };
      } catch (e: any) {
        return { name: r.name, elapsed: Date.now() - start, hits: 0, error: e.message };
      }
    })
  );

  const totalElapsed = Date.now() - globalStart;

  console.log("Registrar          Time     Hits  Error");
  console.log("─".repeat(60));
  for (const r of results.sort((a, b) => a.elapsed - b.elapsed)) {
    const time = `${r.elapsed}ms`.padEnd(9);
    const hits = `${r.hits}`.padEnd(6);
    console.log(`${r.name.padEnd(18)} ${time} ${hits} ${r.error ?? ""}`);
  }
  console.log("─".repeat(60));
  console.log(`Wall time: ${totalElapsed}ms`);
}

main().catch(console.error);
