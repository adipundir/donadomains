#!/usr/bin/env node
// RDAP availability sweeper for .com via Verisign.
// Key reliability trick: Verisign throttles bursts from a single IP and returns
// SPURIOUS 404s (a registered domain looks "available"). So every 404 is
// re-verified twice, sequentially, at low rate — a genuinely-available domain
// returns 404 every time; a throttled registered one flips back to 200.
//
// Usage: node rdap-sweep.mjs --len 5 --count 3000 [--full] --out available-5.txt

const RDAP = (d) => `https://rdap.verisign.com/com/v1/domain/${d}.com`;
const ALPHA_ONLY = process.argv.includes("--alpha");
const CHARS = ALPHA_ONLY
  ? "abcdefghijklmnopqrstuvwxyz"            // [a-z] — brandable, letters only
  : "abcdefghijklmnopqrstuvwxyz0123456789"; // [a-z0-9], no hyphen
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]);
    return a;
  }, [])
);

const LEN = parseInt(args.len, 10);
const FULL = !!args.full;
const COUNT = FULL ? Math.pow(CHARS.length, LEN) : parseInt(args.count, 10);
const OUT = args.out || `available-${LEN}.txt`;
const CONCURRENCY = 8;

function randStr(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

// Build candidate list
function* fullEnum(len) {
  const idx = new Array(len).fill(0);
  const base = CHARS.length;
  const total = Math.pow(base, len);
  for (let n = 0; n < total; n++) {
    let x = n, s = "";
    for (let i = 0; i < len; i++) { s = CHARS[x % base] + s; x = Math.floor(x / base); }
    yield s;
  }
}
function sampleSet(len, count) {
  const set = new Set();
  const cap = Math.min(count, Math.pow(CHARS.length, len));
  while (set.size < cap) set.add(randStr(len));
  return [...set];
}

const candidates = FULL ? [...fullEnum(LEN)] : sampleSet(LEN, COUNT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One RDAP GET → "registered" | "available" | "error"
async function rdapStatus(domain, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(RDAP(domain), { signal: ctrl.signal, headers: { accept: "application/rdap+json" } });
    clearTimeout(t);
    if (res.status === 200) return "registered";
    if (res.status === 404) return "available";
    return "error"; // 429, 5xx, etc.
  } catch {
    clearTimeout(t);
    return "error"; // timeout / network
  }
}

// Resolve a domain with retries + 404 reverification.
async function resolve(domain) {
  let status;
  for (let attempt = 0; attempt < 4; attempt++) {
    status = await rdapStatus(domain);
    if (status !== "error") break;
    await sleep(400 * (attempt + 1)); // backoff on 000/429
  }
  if (status !== "available") return status; // registered or persistent error

  // Reverify the 404 twice, sequentially, slowly — kill throttle false-positives.
  for (let v = 0; v < 2; v++) {
    await sleep(1500);
    let recheck;
    for (let attempt = 0; attempt < 3; attempt++) {
      recheck = await rdapStatus(domain);
      if (recheck !== "error") break;
      await sleep(500 * (attempt + 1));
    }
    if (recheck === "registered") return "registered"; // was a throttle artifact
    if (recheck === "error") return "error";           // inconclusive — don't claim available
  }
  return "available"; // 404 confirmed 3x total
}

let done = 0, registered = 0, available = 0, errored = 0;
const availableList = [];
const fs = await import("node:fs");

async function worker(queue) {
  while (queue.length) {
    const d = queue.pop();
    const r = await resolve(d);
    done++;
    if (r === "registered") registered++;
    else if (r === "available") { available++; availableList.push(d + ".com"); fs.appendFileSync(OUT, d + ".com\n"); }
    else errored++;
    if (done % 250 === 0 || done === candidates.length) {
      process.stdout.write(`[len=${LEN}] ${done}/${candidates.length}  reg=${registered} avail=${available} err=${errored}\n`);
    }
  }
}

fs.writeFileSync(OUT, ""); // reset
const t0 = Date.now();
const queue = [...candidates];
console.log(`[len=${LEN}] starting: ${candidates.length} candidates, concurrency=${CONCURRENCY}, mode=${FULL ? "FULL" : "sample"}`);
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
const secs = ((Date.now() - t0) / 1000).toFixed(0);

console.log(`\n=== len=${LEN} DONE in ${secs}s ===`);
console.log(`checked=${done} registered=${registered} available=${available} errored=${errored}`);
console.log(`availability rate (of conclusive): ${(available / (available + registered) * 100).toFixed(3)}%`);
if (availableList.length) {
  console.log(`available (first 40): ${availableList.slice(0, 40).join(", ")}`);
  console.log(`full list -> ${OUT}`);
}
