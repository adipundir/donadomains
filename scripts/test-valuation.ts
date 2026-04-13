import "dotenv/config";
import { valuateDomain } from "../app/lib/domain-valuation";

async function main() {
  console.log("Testing domain valuation...");
  console.log("GEMINI_API_KEY set:", !!process.env.GEMINI_API_KEY);

  const result = await valuateDomain({
    domain: "google.com",
    registered: true,
    created: "1997-09-15",
    expires: "2028-09-14",
    registrar: "MarkMonitor Inc.",
    dnsResolves: true,
    nameservers: ["ns1.google.com", "ns2.google.com"],
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
