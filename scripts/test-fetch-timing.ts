import "dotenv/config";

// Test raw Firecrawl API timing to see if the SDK/fetch is the bottleneck
async function testRawFetch() {
  const key = process.env.FIRECRAWL_API_KEY_GODADDY!;
  const url = "https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=testdomain123";

  console.log("Testing raw fetch to Firecrawl API...\n");

  const start = Date.now();
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      waitFor: 5000,
      timeout: 30000,
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(`Time: ${elapsed}ms`);
  console.log(`Success: ${data.success}`);
  console.log(`Lines: ${(data.data?.markdown ?? "").split("\n").filter((l: string) => l.trim()).length}`);
}

testRawFetch().catch(console.error);
