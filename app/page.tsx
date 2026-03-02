"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { searchDomainsAction } from "./actions";

function ThemeSwitcher() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");
  return (
    <button
      type="button"
      onClick={toggle}
      className="font-comic-title comic-btn px-3 py-2 text-lg bg-[var(--background)] text-[var(--foreground)] uppercase tracking-wide border-[3px] border-[var(--foreground)] transition-transform"
      style={{ boxShadow: "4px 4px 0px var(--foreground)" }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {!mounted ? "🌙 Dark" : isDark ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}

interface DomainRegistrationDetails {
  registrar?: string;
  created?: string;
  expires?: string;
  registrant?: string;
  contact?: string;
  status?: string[];
}

interface BuyLink {
  name: string;
  url: string;
  price?: string;
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
    setSearchedKeyword(keyword);

    try {
      const result = await searchDomainsAction(keyword.trim());

      if (!result.success) {
        throw new Error(result.error || "Failed to search domains");
      }

      setResults(result.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const centerHero = !searchedKeyword;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {/* Dotted pattern background */}
      <div className="fixed inset-0 opacity-5 pointer-events-none halftone" />

      {/* Navbar: no section line, same background */}
      <nav className="relative py-4 px-6 sm:px-8 w-full bg-[var(--background)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <span className="font-comic-title text-2xl sm:text-3xl uppercase tracking-wide">Donadomains</span>
          <ThemeSwitcher />
        </div>
      </nav>

      {/* Pre-search: one block vertically centered; after search: normal stacked layout */}
      {centerHero ? (
        <div className="flex-1 flex flex-col justify-center w-full bg-[var(--background)]">
          <section className="w-full py-8 sm:py-12 bg-[var(--background)]">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
              <p className="text-center text-[var(--foreground)] font-comic-title text-xl sm:text-2xl uppercase tracking-wide mb-4">
                Find your domain
              </p>
              <form onSubmit={handleSearch} className="w-full">
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. myname or myname.com"
                      className="font-comic-body w-full px-5 py-4 text-lg font-bold bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--foreground)]/25 uppercase comic-border focus:outline-none focus:ring-0"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="font-comic-title px-8 py-4 text-xl bg-black text-white uppercase comic-border comic-btn transition-all disabled:opacity-50 disabled:cursor-not-allowed tracking-wide shrink-0"
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
            </div>
          </section>
          <section className="w-full py-6 bg-[var(--background)]">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
              <p className="text-center text-[var(--foreground)] font-comic-title text-lg uppercase tracking-wide mb-3 opacity-90 flex items-center justify-center gap-2">
                <span className="inline-block text-xl" aria-hidden>↗</span>
                Hot domains right now
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "myname.com",
                  "startup.io",
                  "getapp.dev",
                  "coolname.co",
                  "techstudio.io",
                  "buildship.com",
                  "shipit.app",
                  "cool.tech",
                ].map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => {
                      setKeyword(domain);
                      setError(null);
                      setResults([]);
                      setSearchedKeyword(null);
                    }}
                    className="font-comic-body px-4 py-2 text-sm font-bold uppercase comic-border-thin bg-[var(--background)] text-[var(--foreground)] border-2 border-[var(--foreground)] hover:opacity-90 transition-opacity"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <>
          <section className="w-full py-8 sm:py-12 bg-[var(--background)]">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
              <p className="text-center text-[var(--foreground)] font-comic-title text-xl sm:text-2xl uppercase tracking-wide mb-4">
                Find your domain
              </p>
              <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. myname or myname.com"
                      className="font-comic-body w-full px-5 py-4 text-lg font-bold bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--foreground)]/25 uppercase comic-border focus:outline-none focus:ring-0"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="font-comic-title px-8 py-4 text-xl bg-black text-white uppercase comic-border comic-btn transition-all disabled:opacity-50 disabled:cursor-not-allowed tracking-wide shrink-0"
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
            </div>
          </section>
          <section className="w-full py-6 bg-[var(--background)]">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
              <p className="text-center text-[var(--foreground)] font-comic-title text-lg uppercase tracking-wide mb-3 opacity-90 flex items-center justify-center gap-2">
                <span className="inline-block text-xl" aria-hidden>↗</span>
                Hot domains right now
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "myname.com",
                  "startup.io",
                  "getapp.dev",
                  "coolname.co",
                  "techstudio.io",
                  "buildship.com",
                  "shipit.app",
                  "cool.tech",
                ].map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => {
                      setKeyword(domain);
                      setError(null);
                      setResults([]);
                      setSearchedKeyword(null);
                    }}
                    className="font-comic-body px-4 py-2 text-sm font-bold uppercase comic-border-thin bg-[var(--background)] text-[var(--foreground)] border-2 border-[var(--foreground)] hover:opacity-90 transition-opacity"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Main content: two-column when results; when pre-search no flex-1 so hero stays vertically centered */}
      <div className={`relative flex flex-col mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl ${centerHero ? "" : "flex-1"} ${results.length > 0 ? "justify-start" : "max-w-3xl justify-center"}`}>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--surface)] text-[var(--foreground)] comic-border text-center relative">
            <span className="font-comic-title text-xl uppercase">OOPS! </span>
            <span className="font-bold">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-6 text-center">
            <div className="inline-block p-6 bg-[var(--surface)] text-[var(--foreground)] comic-border relative speech-bubble">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-bounce">*</span>
                <span className="font-comic-title text-xl uppercase tracking-wide">
                  Checking availability...
                </span>
                <span className="text-2xl animate-bounce" style={{ animationDelay: "0.2s" }}>*</span>
              </div>
              <p className="text-sm mt-2 font-medium opacity-80">Buy links to GoDaddy, Namecheap, etc.</p>
            </div>
          </div>
        )}

        {/* Results: GoDaddy-style summary bar + list (Available first, then Taken) */}
        {!loading && results.length > 0 && (() => {
          const availableResults = results.filter(r => r.available);
          const takenResults = results.filter(r => !r.available);
          const card = (result: DomainResult, index: number) => (
            <div
              key={`${result.domain}-${index}`}
              className={`p-4 text-[var(--foreground)] comic-border-thin transition-transform hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                result.available ? "bg-[var(--surface)]" : "bg-[var(--surface-muted)]"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4 min-w-0">
                  <span
                    className={`font-comic-title shrink-0 inline-flex h-10 w-10 items-center justify-center text-2xl border-2 border-[var(--foreground)] ${
                      result.available ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--foreground)] text-[var(--surface)]"
                    }`}
                  >
                    {result.available ? "!" : "X"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide">{result.domain}</p>
                    <p className="text-sm font-bold opacity-70 uppercase mt-0.5">
                      TLD: {result.tld}
                      {result.source && ` · ${result.source}`}
                      {result.matchType && (
                        <span className="ml-2 px-1.5 py-0.5 border border-[var(--foreground)]/40 text-[10px] uppercase">
                          {result.matchType === "exact" ? "Exact" : "Similar"}
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase opacity-80">
                      {result.buyLinks && result.buyLinks.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          Compare prices:{" "}
                          {result.buyLinks.map((link) => (
                            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
                              {link.name}{link.price ? ` ${link.price}` : ""}
                            </a>
                          ))}
                        </span>
                      ) : result.registerUrl ? (
                        <span>
                          Compare prices:{" "}
                          <a href={result.registerUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
                            {result.source ? PLATFORM_LABEL[result.source] ?? result.source : "Registrar"}
                          </a>
                        </span>
                      ) : null}
                    </div>
                    {!result.available && (
                      <div className="mt-3 border border-[var(--foreground)]/25 bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)]">
                        <p className="font-comic-title uppercase mb-1.5 text-[var(--foreground)]">Who owns it & when</p>
                        <ul className="space-y-0.5 font-medium text-[var(--foreground)]">
                          <li><span className="uppercase opacity-75">Who bought:</span> {result.registration?.registrant ?? "—"}</li>
                          <li><span className="uppercase opacity-75">From (registrar):</span> {result.registration?.registrar ?? "—"}</li>
                          {result.registration?.contact && (
                            <li><span className="uppercase opacity-75">Contact:</span> {result.registration.contact}</li>
                          )}
                          <li><span className="uppercase opacity-75">Registered:</span> {result.registration?.created ? formatDate(result.registration.created) : "—"}</li>
                          <li><span className="uppercase opacity-75">Expires:</span> {result.registration?.expires ? formatDate(result.registration.expires) : "—"}</li>
                        </ul>
                        <p className="mt-1.5 opacity-65 text-[10px] uppercase text-[var(--foreground)]">Source: RDAP (registry). Registrar/owner often redacted for privacy.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {result.type && (
                    <span className="font-comic-title px-3 py-1 text-xs uppercase border border-[var(--foreground)] bg-[var(--foreground)]/10">
                      {result.type === "auction" ? "AUCTION" : "EXPIRED"}
                    </span>
                  )}
                  {result.price && <span className="font-comic-title text-xl">{result.price}</span>}
                  <span
                    className={`font-comic-title px-4 py-2 text-base uppercase border-2 border-[var(--foreground)] tracking-wide ${
                      result.available ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--foreground)] text-[var(--surface)]"
                    }`}
                  >
                    {result.available ? "AVAILABLE!" : "TAKEN"}
                  </span>
                </div>
              </div>
            </div>
          );
          const exactTaken = takenResults.filter((r) => r.matchType === "exact");
          const primaryExactTaken =
            exactTaken.find((r) => r.domain === searchedKeyword) ??
            exactTaken.find((r) => r.tld === ".com") ??
            exactTaken[0];

          return (
            <div>
              {/* GoDaddy-style results summary bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-[var(--foreground)]/20 mb-6">
                <h2 className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide text-[var(--foreground)]">
                  {results.length} domain{results.length !== 1 ? "s" : ""} found
                </h2>
                <div className="flex gap-2 text-sm font-bold uppercase text-[var(--foreground)]">
                  <span className="px-3 py-1.5 comic-border-thin bg-[var(--surface)]">{availableResults.length} Available</span>
                  <span className="px-3 py-1.5 comic-border-thin bg-[var(--surface-muted)]">{takenResults.length} Taken</span>
                </div>
              </div>

              {/* Exact match taken: highlight at top with details */}
              {primaryExactTaken && (
                <div className="mb-8 p-5 comic-border bg-[var(--surface-muted)] text-[var(--foreground)] border-2 border-[var(--foreground)]">
                  <p className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide mb-3">
                    {primaryExactTaken.domain} is taken.
                  </p>
                  <div className="border border-[var(--foreground)]/30 bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)]">
                    <p className="font-comic-title uppercase mb-2 text-[var(--foreground)]">Who owns it & when</p>
                    <ul className="space-y-1 font-medium text-[var(--foreground)]">
                      <li><span className="uppercase opacity-80">Who bought:</span> {primaryExactTaken.registration?.registrant ?? "—"}</li>
                      <li><span className="uppercase opacity-80">From (registrar):</span> {primaryExactTaken.registration?.registrar ?? "—"}</li>
                      {primaryExactTaken.registration?.contact && (
                        <li><span className="uppercase opacity-80">Contact:</span> {primaryExactTaken.registration.contact}</li>
                      )}
                      <li><span className="uppercase opacity-80">Registered:</span> {primaryExactTaken.registration?.created ? formatDate(primaryExactTaken.registration.created) : "—"}</li>
                      <li><span className="uppercase opacity-80">Expires:</span> {primaryExactTaken.registration?.expires ? formatDate(primaryExactTaken.registration.expires) : "—"}</li>
                    </ul>
                    <p className="mt-2 opacity-70 text-xs uppercase text-[var(--foreground)]">Source: RDAP (registry). Registrar/owner often redacted for privacy.</p>
                  </div>
                </div>
              )}

              {availableResults.length > 0 && (
                <>
                  <h3 className="font-comic-title text-lg uppercase tracking-wide mb-1">Available — register now</h3>
                  <p className="text-xs opacity-70 mb-4">Availability from registry (RDAP/DNS). Confirm at GoDaddy, Namecheap, etc. before purchasing.</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-10">
                    {availableResults.map((r, i) => card(r, i))}
                  </div>
                </>
              )}
              {takenResults.length > 0 && (
                <>
                  <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">Taken</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {takenResults.map((r, i) => card(r, i))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* No Results */}
        {!loading && searchedKeyword && results.length === 0 && !error && (
          <div className="text-center p-6 comic-border bg-[var(--surface)] text-[var(--foreground)]">
            <h3 className="uppercase text-2xl tracking-wide">
              No domains found for &quot;{searchedKeyword}&quot;
            </h3>
            <p className="font-bold mt-2">Try a different keyword!</p>
          </div>
        )}
      </div>

      {/* Footer: anchored at bottom */}
      <footer className="py-6 text-center bg-[var(--background)]">
        <p className="font-comic-title text-lg uppercase tracking-wide">
          Product of Donalabs
        </p>
      </footer>
    </div>
  );
}
