"use client";

import { useState, useEffect, useCallback } from "react";
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
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  status?: string[];
}

interface BuyLink {
  name: string;
  url: string;
  price?: string;
  priceNum?: number;
  renewalPrice?: string;
  renewalPriceNum?: number;
  isCheapest?: boolean;
  source?: "api" | "scraped";
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

/** Comic-style price tag icon (bold outline) */
function PriceTagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
      <path d="M8 8h.01" />
    </svg>
  );
}

/** Comic-style star for cheapest */
function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
    </svg>
  );
}

/** Comic-style store/shop icon */
function StoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "available" | "taken">("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
    setFilter("all");

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
          {searchedKeyword === null && (
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
          )}
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
          {searchedKeyword === null && (
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
          )}
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

        {/* Loading: 3 dots below main area when searching (button already shows loading state) */}
        {loading && (
          <div className="flex justify-center gap-1 py-4">
            <span className="w-2 h-2 rounded-full bg-[var(--foreground)] animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-[var(--foreground)] animate-bounce" style={{ animationDelay: "0.15s" }} />
            <span className="w-2 h-2 rounded-full bg-[var(--foreground)] animate-bounce" style={{ animationDelay: "0.3s" }} />
          </div>
        )}

        {/* Results: GoDaddy-style summary bar + list (Available first, then Taken) */}
        {!loading && results.length > 0 && (() => {
          const availableResults = results.filter(r => r.available);
          const takenResults = results.filter(r => !r.available);
          const card = (result: DomainResult, index: number) => (
            <div
              key={`${result.domain}-${index}`}
              className={`p-4 text-[var(--foreground)] comic-border-thin transition-transform hover:translate-x-1 hover:translate-y-1 hover:shadow-none flex flex-col min-h-0 ${
                result.available ? "bg-[var(--surface)]" : "bg-[var(--surface-muted)]"
              }`}
            >
              {/* Top row: icon, domain info, buttons */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between flex-shrink-0">
                <div className="flex items-start gap-4 min-w-0">
                  <span
                    className={`font-comic-title shrink-0 inline-flex h-10 w-10 items-center justify-center text-2xl border-2 border-[var(--foreground)] ${
                      result.available ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--foreground)] text-[var(--surface)]"
                    }`}
                  >
                    {result.available ? "✓" : "X"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide">{result.domain}</p>
                    <p className="text-sm font-bold opacity-70 uppercase mt-0.5 flex flex-wrap items-center gap-2">
                      {result.domain.toLowerCase() === (searchedKeyword?.toLowerCase() ?? "") && (
                        <span className="px-2 py-0.5 bg-[var(--foreground)] text-[var(--surface)] text-[10px] uppercase font-comic-title">
                          Your search
                        </span>
                      )}
                      <span>TLD: {result.tld}</span>
                      {result.source && ` · ${result.source}`}
                      {result.matchType && (
                        <span className="px-1.5 py-0.5 border border-[var(--foreground)]/40 text-[10px] uppercase">
                          {result.matchType === "exact" ? "Exact" : "Similar"}
                        </span>
                      )}
                    </p>
                    {result.available && (
                      <div className="mt-3">
                        {result.buyLinks && result.buyLinks.length > 0 ? (
                          <div>
                            <p className="text-xs font-comic-title uppercase tracking-wide opacity-70 mb-2 flex items-center gap-1.5">
                              <StoreIcon className="w-4 h-4" />
                              Register at
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {result.buyLinks.map((link) => (
                                <a
                                  key={link.name}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold uppercase comic-border-thin border-2 transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none ${
                                    link.isCheapest
                                      ? "bg-[var(--foreground)] text-[var(--surface)] border-[var(--foreground)]"
                                      : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--foreground)]/40"
                                  }`}
                                  style={link.isCheapest ? { boxShadow: "3px 3px 0 var(--foreground)" } : undefined}
                                >
                                  {link.price ? (
                                    <PriceTagIcon className="w-4 h-4 shrink-0" />
                                  ) : (
                                    <StoreIcon className="w-4 h-4 shrink-0 opacity-60" />
                                  )}
                                  <span>{link.name}</span>
                                  {link.price && (
                                    <span className={link.isCheapest ? "font-comic-title" : ""}>
                                      {link.price}
                                    </span>
                                  )}
                                  {link.isCheapest && (
                                    <StarIcon className="w-4 h-4 shrink-0" aria-label="cheapest" />
                                  )}
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                  {result.type && (
                    <span className="font-comic-title px-3 py-1 text-xs uppercase border border-[var(--foreground)] bg-[var(--foreground)]/10">
                      {result.type === "auction" ? "AUCTION" : "EXPIRED"}
                    </span>
                  )}
                  {result.price && <span className="font-comic-title text-xl">{result.price}</span>}
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-comic-title px-4 py-2 text-base uppercase border-2 border-[var(--foreground)] tracking-wide ${
                        result.available ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--foreground)] text-[var(--surface)]"
                      }`}
                    >
                      {result.available ? "AVAILABLE" : "TAKEN"}
                    </span>
                    {!result.available && (result.registration?.contactEmail || result.registration?.contactPhone) && (
                      <a
                        href={result.registration.contactEmail ? `mailto:${result.registration.contactEmail}` : result.registration.contactPhone ? `tel:${result.registration.contactPhone.replace(/\D/g, "")}` : "#"}
                        className="font-comic-title px-4 py-2 text-sm uppercase border-2 border-[var(--foreground)] tracking-wide bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--surface)] transition-colors whitespace-nowrap"
                      >
                        Contact owner
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Who owns it block: fills rest of card below the buttons */}
              {!result.available && (
                <div className="mt-4 flex-1 min-h-[120px] flex flex-col">
                  <div className="border border-[var(--foreground)]/25 bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] flex-1 flex flex-col">
                    <p className="font-comic-title uppercase mb-1.5 text-[var(--foreground)]">Who owns it & when</p>
                    <ul className="space-y-0.5 font-medium text-[var(--foreground)] flex-1">
                      <li><span className="uppercase opacity-75">Who bought:</span> {result.registration?.registrant ?? "—"}</li>
                      <li><span className="uppercase opacity-75">From (registrar):</span> {result.registration?.registrar ?? "—"}</li>
                      {(result.registration?.contact || result.registration?.contactEmail || result.registration?.contactPhone || result.registration?.contactAddress) && (
                        <li>
                          <span className="uppercase opacity-75">Contact:</span>{" "}
                          {result.registration.contactEmail ? (
                            <a href={`mailto:${result.registration.contactEmail}`} className="underline hover:opacity-80">{result.registration.contactEmail}</a>
                          ) : null}
                          {result.registration.contactEmail && (result.registration.contactPhone || result.registration.contactAddress) ? " · " : null}
                          {result.registration.contactPhone ?? ""}
                          {result.registration.contactPhone && result.registration.contactAddress ? " · " : null}
                          {result.registration.contactAddress ?? ""}
                          {!result.registration.contactEmail && !result.registration.contactPhone && !result.registration.contactAddress ? result.registration.contact : null}
                        </li>
                      )}
                      <li><span className="uppercase opacity-75">Registered:</span> {result.registration?.created ? formatDate(result.registration.created) : "—"}</li>
                      <li><span className="uppercase opacity-75">Expires:</span> {result.registration?.expires ? formatDate(result.registration.expires) : "—"}</li>
                    </ul>
                    <p className="mt-1.5 opacity-65 text-[10px] uppercase text-[var(--foreground)] flex-shrink-0">Source: RDAP (registry). Registrar/owner often redacted for privacy.</p>
                  </div>
                </div>
              )}
            </div>
          );
          const filtered = filter === "all" ? results : results.filter((r) => filter === "available" ? r.available : !r.available);
          const searchedLower = (searchedKeyword ?? "").toLowerCase().trim();
          const userTypedTld = searchedLower.includes(".");
          const userSearchedResult = userTypedTld
            ? filtered.find((r) => r.domain.toLowerCase() === searchedLower) ?? null
            : null;
          const restResults = filtered.filter((r) => r.domain !== userSearchedResult?.domain);
          const restAvailable = restResults.filter((r) => r.available);
          const restTaken = restResults.filter((r) => !r.available);

          return (
            <div>
              {/* Summary bar with filter toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-[var(--foreground)]/20 mb-6">
                <h2 className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide text-[var(--foreground)]">
                  {filtered.length} domain{filtered.length !== 1 ? "s" : ""} found
                </h2>
                <div className="flex gap-2 text-sm font-bold uppercase text-[var(--foreground)]">
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "available" ? "all" : "available")}
                    className={`px-3 py-1.5 comic-border-thin transition-colors ${
                      filter === "available"
                        ? "bg-[var(--foreground)] text-[var(--surface)]"
                        : "bg-[var(--surface)] hover:opacity-80"
                    }`}
                  >
                    {availableResults.length} Available
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter(filter === "taken" ? "all" : "taken")}
                    className={`px-3 py-1.5 comic-border-thin transition-colors ${
                      filter === "taken"
                        ? "bg-[var(--foreground)] text-[var(--surface)]"
                        : "bg-[var(--surface)] hover:opacity-80"
                    }`}
                  >
                    {takenResults.length} Taken
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center p-6 comic-border bg-[var(--surface)] text-[var(--foreground)]">
                  <p className="font-comic-title text-xl uppercase">
                    No {filter} domains found
                  </p>
                  <button type="button" onClick={() => setFilter("all")} className="mt-3 font-bold underline uppercase text-sm hover:opacity-80">
                    Show all results
                  </button>
                </div>
              ) : userTypedTld ? (
                <>
                  {userSearchedResult && (
                    <div className="mb-8">
                      <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">
                        Your search: {userSearchedResult.domain}
                      </h3>
                      {card(userSearchedResult, 0)}
                    </div>
                  )}
                  {restAvailable.length > 0 && (
                    <>
                      <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">Other available domains</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-10">
                        {restAvailable.map((r, i) => card(r, i))}
                      </div>
                    </>
                  )}
                  {restTaken.length > 0 && (
                    <>
                      <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">Other taken domains</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {restTaken.map((r, i) => card(r, i))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  {restAvailable.length > 0 && (
                    <>
                      <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">Available — register now</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-10">
                        {restAvailable.map((r, i) => card(r, i))}
                      </div>
                    </>
                  )}
                  {restTaken.length > 0 && (
                    <>
                      <h3 className="font-comic-title text-lg uppercase tracking-wide mb-4">Taken</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {restTaken.map((r, i) => card(r, i))}
                      </div>
                    </>
                  )}
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

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 z-50 h-12 w-12 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)] border-[3px] border-[var(--foreground)] comic-btn transition-all hover:scale-110 focus:outline-none"
          style={{ boxShadow: "4px 4px 0px var(--foreground)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}

      {/* Footer: anchored at bottom */}
      <footer className="py-6 text-center bg-[var(--background)]">
        <p className="font-comic-title text-lg uppercase tracking-wide">
          Product of Donalabs
        </p>
      </footer>
    </div>
  );
}
