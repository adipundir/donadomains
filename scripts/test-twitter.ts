import "dotenv/config";

async function check(username: string) {
  const res = await fetch(
    "https://syndication.twitter.com/srv/timeline-profile/screen-name/" + username,
    { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0" } },
  );
  const text = await res.text();
  const hasTimeline = text.includes("timeline-Tweet");
  console.log(`${username}: status=${res.status} hasTimeline=${hasTimeline} size=${text.length}`);
  console.log("  snippet:", text.slice(0, 400));
  console.log();
}

async function main() {
  await check("adipundir");
  await check("xyznonexistent99q");
  await check("elonmusk");
}

main().catch(console.error);
