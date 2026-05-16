/**
 * Probe different Firecrawl options to find one that gets through GoDaddy's
 * Akamai bot protection. Standard scrape returns a 3-line "Powered and
 * protected by Akamai" interstitial — we need to break out of that.
 *
 *   npx tsx scripts/test-godaddy-bypass.ts
 */

import "dotenv/config";
import FirecrawlApp from "@mendable/firecrawl-js";

const KEY = process.env.FIRECRAWL_API_KEY_GODADDY;
if (!KEY) throw new Error("FIRECRAWL_API_KEY_GODADDY is not set");

const URL = "https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=donataxes";

interface Probe {
  name: string;
  // Firecrawl options accept a wide variety of shapes across SDK versions —
  // type as `any` and let runtime decide. We're explicitly probing edges here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any;
}

const PROBES: Probe[] = [
  {
    name: "baseline (current prod settings)",
    opts: { formats: ["markdown"], waitFor: 3000, timeout: 20000 },
  },
  {
    name: "longer wait (8s)",
    opts: { formats: ["markdown"], waitFor: 8000, timeout: 25000 },
  },
  {
    name: "mobile UA",
    opts: { formats: ["markdown"], waitFor: 3000, timeout: 20000, mobile: true },
  },
  {
    name: "stealth proxy",
    opts: { formats: ["markdown"], waitFor: 3000, timeout: 25000, proxy: "stealth" },
  },
  {
    name: "basic proxy",
    opts: { formats: ["markdown"], waitFor: 3000, timeout: 25000, proxy: "basic" },
  },
  {
    name: "stealth + mobile + wait 6s",
    opts: { formats: ["markdown"], waitFor: 6000, timeout: 30000, proxy: "stealth", mobile: true },
  },
  {
    name: "html only (no markdown conversion)",
    opts: { formats: ["html"], waitFor: 3000, timeout: 20000 },
  },
  {
    name: "stealth + actions (scroll + wait)",
    opts: {
      formats: ["markdown"],
      timeout: 30000,
      proxy: "stealth",
      actions: [
        { type: "wait", milliseconds: 5000 },
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 3000 },
      ],
    },
  },
];

interface OutcomeMeta { statusCode?: number }
interface Outcome {
  success: boolean;
  lineCount: number;
  bytes: number;
  ms: number;
  hasAkamai: boolean;
  hasGodaddy: boolean;
  hasResults: boolean;
  sample: string;
  error?: string;
  metadata?: OutcomeMeta;
}

async function run(probe: Probe, fc: FirecrawlApp): Promise<Outcome> {
  const t0 = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = await fc.scrape(URL, probe.opts);
    const ms = Date.now() - t0;
    const body = (doc.markdown ?? doc.html ?? "") as string;
    const lines = body.split("\n").filter((l) => l.trim());
    const lower = body.toLowerCase();
    return {
      success: true,
      lineCount: lines.length,
      bytes: body.length,
      ms,
      hasAkamai: /akamai/i.test(body) && /protected by|please verify/i.test(body),
      hasGodaddy: /godaddy|domain search|find your perfect|domain is/i.test(lower),
      hasResults: /donataxes/i.test(lower),
      sample: lines.slice(0, 8).join("\n   ").slice(0, 500),
      metadata: doc.metadata,
    };
  } catch (err) {
    return {
      success: false,
      lineCount: 0,
      bytes: 0,
      ms: Date.now() - t0,
      hasAkamai: false,
      hasGodaddy: false,
      hasResults: false,
      sample: "",
      error: (err as Error).message,
    };
  }
}

(async () => {
  const fc = new FirecrawlApp({ apiKey: KEY });

  for (const probe of PROBES) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ${probe.name}`);
    console.log(`  opts: ${JSON.stringify(probe.opts)}`);
    console.log("─".repeat(70));

    const r = await run(probe, fc);
    if (!r.success) {
      console.log(`  ✗ ERROR in ${r.ms}ms: ${r.error}`);
      continue;
    }
    const verdict = r.hasResults
      ? "🎉 GOT RESULTS"
      : r.hasGodaddy
        ? "✓ got GoDaddy page (no donataxes hit?)"
        : r.hasAkamai
          ? "🛑 Akamai block"
          : "? unknown";

    console.log(`  ${verdict}`);
    console.log(`  ${r.lineCount} lines, ${r.bytes} bytes, ${r.ms}ms`);
    if (r.metadata?.statusCode) console.log(`  HTTP ${r.metadata.statusCode}`);
    console.log(`  sample:\n   ${r.sample}`);
  }
})();
