/**
 * Fetch RDAP data for donataxes.com and log raw JSON response.
 * Verisign .com RDAP: https://rdap.verisign.com/com/v1/domain/donataxes.com
 */
const url = "https://rdap.verisign.com/com/v1/domain/donataxes.com";

(async () => {
  const res = await fetch(url);
  const text = await res.text();

  console.log("Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));
  console.log();

  if (text.length === 0) {
    console.log("(Empty body - domain may not exist or return 404)");
    return;
  }

  const json = JSON.parse(text);
  console.log("=== Raw RDAP Response ===");
  console.log(JSON.stringify(json, null, 2));
  console.log("\n=== Top-level keys ===");
  console.log(Object.keys(json));
  if (json.events) {
    console.log("\n=== Events ===");
    console.log(JSON.stringify(json.events, null, 2));
  }
  if (json.entities) {
    console.log("\n=== Entities (incl. nested) ===");
    console.log(JSON.stringify(json.entities, null, 2));
  }
})();
