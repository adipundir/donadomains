/**
 * HTTP client for donadomains.xyz public API.
 *
 * Base URL is configurable via `DONADOMAINS_BASE_URL` env var so users can
 * point at a staging host (or `http://localhost:3000` for local dev).
 */

import type { DomainIntel, DomainValuation, SearchResponse } from "./types.js";

const DEFAULT_BASE_URL = "https://donadomains.xyz";
const DEFAULT_TIMEOUT_MS = 30_000;

function baseUrl(): string {
  return (process.env.DONADOMAINS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

interface FetchOpts {
  timeoutMs?: number;
}

async function getJson<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "donadomains-mcp/0.1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `donadomains API ${res.status} ${res.statusText} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }

  return (await res.json()) as T;
}

export const donadomains = {
  /** Search domains and pricing across registrars for a keyword or full domain. */
  search(keyword: string): Promise<SearchResponse> {
    return getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(keyword)}`, {
      // Registrar scraping can take 5-15s; allow generous time.
      timeoutMs: 55_000,
    });
  },

  /** Deep WHOIS/RDAP/DNS intelligence for a single domain. */
  getDomainInfo(domain: string): Promise<DomainIntel> {
    return getJson<DomainIntel>(`/api/domain/${encodeURIComponent(domain)}`);
  },

  /** Gemini-powered domain valuation (cached server-side). */
  valuateDomain(
    domain: string,
    ctx: { registered?: boolean; isPremium?: boolean; registrationPrice?: number } = {},
  ): Promise<DomainValuation> {
    const params = new URLSearchParams();
    if (ctx.registered !== undefined) params.set("registered", String(ctx.registered));
    if (ctx.isPremium !== undefined) params.set("isPremium", String(ctx.isPremium));
    if (ctx.registrationPrice !== undefined) params.set("registrationPrice", String(ctx.registrationPrice));
    const qs = params.toString();
    return getJson<DomainValuation>(
      `/api/valuate/${encodeURIComponent(domain)}${qs ? `?${qs}` : ""}`,
    );
  },
};
