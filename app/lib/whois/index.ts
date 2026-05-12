/**
 * Public WHOIS API. Wraps the port-43 client + IANA discovery + parser into
 * one async function that returns structured data for any domain whose TLD
 * has a WHOIS server.
 *
 * Performance budget (cold): 200ms (IANA discovery) + 300ms (registry) +
 * 300ms (optional referral) = ~800ms worst-case. Warm path skips discovery.
 *
 * Returns null when:
 *   - TLD has no WHOIS server
 *   - Server returned no data we could parse
 *   - Timeout / network error
 */

import { log, timer } from "../log";
import { whoisQuery } from "./client";
import { discoverWhoisServer } from "./discovery";
import { mergeWhoisParsed, parseWhoisText, type WhoisParsed } from "./parser";

export type { WhoisParsed } from "./parser";

export interface WhoisLookupOptions {
  /** Per-query timeout (registry hop, referral hop each get this). Default 4000ms. */
  timeoutMs?: number;
  /** Follow `Registrar WHOIS Server:` referral for thicker data. Default true. */
  followReferral?: boolean;
}

export interface WhoisLookupResult extends WhoisParsed {
  /** Hostname of the server that produced this data. */
  source: string;
  /** True if registrar referral was followed and merged. */
  referralFollowed: boolean;
}

export async function whoisLookup(
  domain: string,
  opts: WhoisLookupOptions = {},
): Promise<WhoisLookupResult | null> {
  const { timeoutMs = 4000, followReferral = true } = opts;
  const normalized = domain.toLowerCase().trim();
  const parts = normalized.split(".");
  if (parts.length < 2) return null;

  // Try most-specific to least-specific suffix (handles 2nd-level ccTLDs like co.uk).
  const suffixes: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    suffixes.push(parts.slice(i).join("."));
  }

  let server: string | null = null;
  let tld: string | null = null;
  for (const suffix of suffixes) {
    const s = await discoverWhoisServer(suffix);
    if (s) {
      server = s;
      tld = suffix;
      break;
    }
  }

  if (!server || !tld) {
    log.debug("whois.no_server", { domain: normalized });
    return null;
  }

  const done = timer();
  let raw: string;
  try {
    raw = await whoisQuery({ server, query: normalized, timeoutMs });
  } catch (err) {
    log.warn("whois.query_failed", {
      domain: normalized,
      server,
      tld,
      ms: done(),
      error: (err as Error).message,
    });
    return null;
  }

  let parsed = parseWhoisText(raw);
  if (!parsed) {
    log.debug("whois.unparseable", { domain: normalized, server, ms: done(), bytes: raw.length });
    return null;
  }

  let referralFollowed = false;
  if (followReferral && parsed.registrarWhoisServer) {
    const referral = parsed.registrarWhoisServer.trim();
    // Some registries (e.g. nic.sh) report a web URL like
    // "https://www.spaceship.com/domains/whois/" as the registrar WHOIS
    // server. That's a browser-facing lookup form, not a port-43 server —
    // skip it. Only follow referrals that look like bare hostnames OR
    // hostnames prefixed with `whois://`.
    const isHttpUrl = /^https?:\/\//i.test(referral);
    const isWhoisUrl = /^whois:\/\//i.test(referral);
    const referralHost = (isWhoisUrl ? referral.replace(/^whois:\/\//i, "") : referral)
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
    const looksLikeWhoisHost = /^whois\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(referralHost);
    const validHost = /^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(referralHost);
    if (!isHttpUrl && validHost && looksLikeWhoisHost && referralHost !== server) {
      try {
        const referralRaw = await whoisQuery({
          server: referralHost,
          query: normalized,
          timeoutMs,
        });
        const referralParsed = parseWhoisText(referralRaw);
        if (referralParsed) {
          parsed = mergeWhoisParsed(parsed, referralParsed);
          referralFollowed = true;
        }
      } catch (err) {
        log.debug("whois.referral_failed", {
          domain: normalized,
          referral: referralHost,
          error: (err as Error).message,
        });
      }
    }
  }

  log.info("whois.ok", {
    domain: normalized,
    tld,
    server,
    referralFollowed,
    ms: done(),
    hasExpiry: Boolean(parsed.expires),
    hasRegistrar: Boolean(parsed.registrar),
  });

  return { ...parsed, source: server, referralFollowed };
}
