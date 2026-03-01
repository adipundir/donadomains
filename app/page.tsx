"use client";

import { useState } from "react";
import { searchDomainsAction } from "./actions";

interface DomainRegistrationDetails {
  registrar?: string;
  created?: string;
  expires?: string;
  registrant?: string;
  status?: string[];
}

interface BuyLink {
  name: string;
  url: string;
}

interface DomainResult {
  domain: string;
  available: boolean;
  price?: string;
  tld: string;
  source?: string;
  type?: "expired" | "auction";
  matchType?: "exact" | "similar";
  sourceUrl?: string;
  buyLinks?: BuyLink[];
  registerUrl?: string;
  registration?: DomainRegistrationDetails;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

interface SourceStatus {
  name: string;
  status: "ok" | "failed";
  count: number;
  error?: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  "GoDaddy": "GoDaddy",
  "GoDaddy (API)": "GoDaddy",
  "Namecheap": "Namecheap",
  "Dynadot Auctions": "Dynadot Auctions",
  "ExpiredDomains.net": "Backorder (GoDaddy)",
  "DNS/RDAP Check": "GoDaddy",
};

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!keyword.trim()) {
      setError("Please enter a keyword to search");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setSourceStatuses([]);
    setSearchedKeyword(keyword);

    try {
      const result = await searchDomainsAction(keyword.trim());

      if (!result.success) {
        throw new Error(result.error || "Failed to search domains");
      }

      setResults(result.results);
      setSourceStatuses(result.sourceStatuses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Dotted pattern background */}
      <div className="fixed inset-0 opacity-5 pointer-events-none halftone" />

      {/* Main content: vertically centered in the space above the footer */}
      <div className="relative flex-1 flex flex-col justify-center mx-auto max-w-3xl px-6 py-12 w-full">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-block relative mb-6">
            <h1 className="text-5xl sm:text-6xl uppercase tracking-wide rotate-[-1deg]">
              Agentic Domain Finder
            </h1>
            <div className="absolute -bottom-2 left-0 right-0 h-3 bg-black -skew-x-3" />
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-10">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Type your domain name..."
                className="font-comic-body w-full px-5 py-4 text-lg font-bold bg-white text-black placeholder-black/40 uppercase comic-border focus:outline-none focus:ring-0"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="font-comic-title px-8 py-4 text-xl bg-black text-white uppercase comic-border comic-btn transition-all disabled:opacity-50 disabled:cursor-not-allowed tracking-wide"
              style={{ boxShadow: "4px 4px 0px #000" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block animate-bounce">.</span>
                  <span className="inline-block animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                  <span className="inline-block animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                </span>
              ) : (
                "SEARCH!"
              )}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-white comic-border text-center relative">
            <span className="font-comic-title text-xl uppercase">OOPS! </span>
            <span className="font-bold">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-8 text-center">
            <div className="inline-block p-6 bg-white comic-border relative speech-bubble">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-bounce">*</span>
                <span className="font-comic-title text-xl uppercase tracking-wide">
                  Checking availability...
                </span>
                <span className="text-2xl animate-bounce" style={{ animationDelay: "0.2s" }}>*</span>
              </div>
              <p className="text-sm mt-2 font-medium">Data from registry (RDAP/DNS) · Buy links to GoDaddy, Namecheap, etc.</p>
            </div>
          </div>
        )}

        {/* Fetch status: which sources succeeded/failed */}
        {!loading && sourceStatuses.length > 0 && (
          <div className="mb-6 p-4 bg-white comic-border-thin">
            <h3 className="font-comic-title text-lg uppercase tracking-wide mb-3">Where we fetched from</h3>
            <ul className="flex flex-wrap gap-2">
              {sourceStatuses.map((s) => (
                <li
                  key={s.name}
                  className={`font-bold text-sm uppercase px-3 py-1.5 border-2 border-black ${
                    s.status === "ok" ? "bg-black text-white" : "bg-white text-black"
                  }`}
                  title={s.status === "failed" && s.error ? s.error : undefined}
                >
                  {s.status === "ok" ? "✓" : "✗"} {s.name}: {s.count} result{s.count !== 1 ? "s" : ""}
                  {s.status === "failed" && s.error && (
                    <span className="block text-xs normal-case mt-0.5 opacity-90 truncate max-w-[200px]">
                      {s.error.length > 60 ? `${s.error.slice(0, 60)}…` : s.error}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Results: Available at top, then Taken; exact/primary TLDs first in each group */}
        {!loading && results.length > 0 && (() => {
          const availableResults = results.filter(r => r.available);
          const takenResults = results.filter(r => !r.available);
          const card = (result: DomainResult, index: number) => (
            <div
              key={`${result.domain}-${index}`}
              className={`p-4 bg-white comic-border-thin transition-transform hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                result.available ? "bg-white" : "bg-black/5"
              }`}
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <span
                    className={`font-comic-title inline-flex h-10 w-10 items-center justify-center text-2xl border-2 border-black ${
                      result.available ? "bg-white text-black" : "bg-black text-white"
                    }`}
                  >
                    {result.available ? "!" : "X"}
                  </span>
                  <div>
                    <p className="font-comic-title text-2xl uppercase tracking-wide">{result.domain}</p>
                    <p className="text-sm font-bold text-black/60 uppercase">
                      TLD: {result.tld}
                      {result.source && ` · ${result.source}`}
                      {result.matchType && (
                        <span className="ml-2 px-1.5 py-0.5 border border-black/40 text-[10px] uppercase">
                          {result.matchType === "exact" ? "Exact" : "Similar"}
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase text-black/70">
                      {result.sourceUrl && (
                        <span>
                          Data from:{" "}
                          <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-black">
                            {result.source || "Registry"}
                          </a>
                        </span>
                      )}
                      {result.buyLinks && result.buyLinks.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          Compare prices:{" "}
                          {result.buyLinks.map((link) => (
                            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-black">
                              {link.name}
                            </a>
                          ))}
                        </span>
                      ) : result.registerUrl ? (
                        <span>
                          Compare prices:{" "}
                          <a href={result.registerUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-black">
                            {result.source ? PLATFORM_LABEL[result.source] ?? result.source : "Registrar"}
                          </a>
                        </span>
                      ) : null}
                    </div>
                    {!result.available && result.registration && (result.registration.registrar != null || result.registration.created != null || result.registration.expires != null || result.registration.registrant != null) && (
                      <div className="mt-3 border border-black/20 bg-black/5 px-3 py-2 text-xs">
                        <p className="font-comic-title uppercase text-black/80 mb-1.5">Registration details</p>
                        <ul className="space-y-0.5 font-medium text-black/80">
                          {result.registration.registrar != null && <li><span className="uppercase text-black/60">Registrar:</span> {result.registration.registrar}</li>}
                          {result.registration.created != null && <li><span className="uppercase text-black/60">Created:</span> {formatDate(result.registration.created)}</li>}
                          {result.registration.expires != null && <li><span className="uppercase text-black/60">Expires:</span> {formatDate(result.registration.expires)}</li>}
                          {result.registration.registrant != null && <li><span className="uppercase text-black/60">Registrant:</span> {result.registration.registrant}</li>}
                        </ul>
                        <p className="mt-1.5 text-black/50 text-[10px] uppercase">Source: RDAP (registry — same data registrars use)</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {result.type && (
                    <span className="font-comic-title px-3 py-1 text-xs uppercase border border-black bg-black/5">
                      {result.type === "auction" ? "AUCTION" : "EXPIRED"}
                    </span>
                  )}
                  {result.price && <span className="font-comic-title text-xl">{result.price}</span>}
                  <span
                    className={`font-comic-title px-4 py-2 text-base uppercase border-2 border-black tracking-wide ${
                      result.available ? "bg-white text-black" : "bg-black text-white"
                    }`}
                  >
                    {result.available ? "AVAILABLE!" : "TAKEN"}
                  </span>
                </div>
              </div>
            </div>
          );
          return (
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <h2 className="text-2xl uppercase bg-black text-white px-4 py-2 rotate-[-1deg] tracking-wide">
                  {results.length} domains found
                </h2>
                <div className="flex gap-3 text-sm font-bold uppercase">
                  <span className="px-3 py-1 border-2 border-black bg-white">{availableResults.length} Available</span>
                  <span className="px-3 py-1 border-2 border-black bg-black/10">{takenResults.length} Taken</span>
                </div>
              </div>
              {availableResults.length > 0 && (
                <>
                  <h3 className="font-comic-title text-xl uppercase tracking-wide mb-3 mt-2">Available — register now</h3>
                  <div className="grid gap-4 mb-8">
                    {availableResults.map((r, i) => card(r, i))}
                  </div>
                </>
              )}
              {takenResults.length > 0 && (
                <>
                  <h3 className="font-comic-title text-xl uppercase tracking-wide mb-3">Taken</h3>
                  <div className="grid gap-4">
                    {takenResults.map((r, i) => card(r, i))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* No Results */}
        {!loading && searchedKeyword && results.length === 0 && !error && (
          <div className="text-center p-6 comic-border bg-white">
            <h3 className="uppercase text-2xl tracking-wide">
              No domains found for &quot;{searchedKeyword}&quot;
            </h3>
            <p className="font-bold mt-2">Try a different keyword!</p>
          </div>
        )}
      </div>

      {/* Footer: anchored at bottom */}
      <footer className="border-t border-black/20 py-6 text-center space-y-1">
        <p className="font-comic-title text-lg uppercase tracking-wide">
          Product of Donalabs
        </p>
        <p className="text-xs text-black/50">
          <a href="https://www.icann.org/en/contracted-parties/accredited-registrars/how-to-become-a-registrar" target="_blank" rel="noopener noreferrer" className="underline hover:text-black/70">How to become a registrar?</a>
        </p>
      </footer>
    </div>
  );
}
