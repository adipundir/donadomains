"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { searchDomainsAction } from "./actions";

function ThemeSwitcher() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="p-2 rounded-full hover:bg-[var(--surface-muted)] transition-colors"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {!mounted ? (
        <span className="w-5 h-5 block" />
      ) : isDark ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
      )}
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
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const STATUS_LABELS: Record<string, string> = {
  clientTransferProhibited: "Transfer locked",
  serverTransferProhibited: "Transfer locked",
  clientUpdateProhibited: "Update locked",
  serverUpdateProhibited: "Update locked",
  clientDeleteProhibited: "Delete locked",
  serverDeleteProhibited: "Delete locked",
  renewPeriod: "Renewal grace",
  redemptionPeriod: "Redemption",
  pendingDelete: "Pending delete",
  addPeriod: "Add period",
};

function formatStatus(status?: string[]): string {
  if (!status?.length) return "";
  return status.map((s) => STATUS_LABELS[s] || s).join(", ");
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

const HOT_DOMAINS = ["coolstartup", "myportfolio.dev", "getapp.io", "brand.co", "shipped.app", "devtools.ai"];

/*
 * Loading stages map to the REAL server pipeline:
 *
 * Phase 1 (t=0, parallel):
 *   - searchAllRegistrars()    → Firecrawl scrape 8+ sites  (~10-15s, 15s timeout)
 *
 * Phase 2 (after Phase 1, sync):
 *   - Build hits map, determine availability, merge buy links, sort  (~instant)
 *
 * Phase 3 (async):
 *   - fetchRdapDetails for up to 10 taken domains (~2-3s, 4s cap)
 */

const PARALLEL_TASKS = [
  { id: "scrape", label: "Multi-registrar aggregation", completesAt: 10000 },
];

const POST_TASKS = [
  { after: 10000, label: "Merging prices & ranking" },
  { after: 12000, label: "Fetching RDAP details for taken domains" },
];

function LoadingStages({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 200);
    return () => clearInterval(id);
  }, [startTime]);

  const allParallelDone = PARALLEL_TASKS.every((t) => elapsed >= t.completesAt);

  const activePostIndex = allParallelDone
    ? POST_TASKS.reduce((idx, task, i) => (elapsed >= task.after ? i : idx), 0)
    : -1;

  return (
    <div className="flex flex-col items-center py-16 gap-8 animate-fadeInUp">
      <div className="w-full max-w-md">
        {/* Parallel phase */}
        <p className="font-comic-title text-xs uppercase tracking-widest opacity-40 mb-3 px-3">
          Running in parallel
        </p>
        <div className="space-y-0.5 mb-6">
          {PARALLEL_TASKS.map((task) => {
            const done = elapsed >= task.completesAt;
            const running = !done;
            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 py-2 px-3 transition-all duration-300 ${done ? "opacity-50" : "opacity-100"}`}
              >
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {done ? (
                    <svg className="w-4 h-4 text-[var(--green)] animate-checkPop" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] loading-stage-pulse" />
                  )}
                </div>
                <p className={`font-comic-body text-sm font-bold leading-tight ${done ? "line-through decoration-[var(--green)] decoration-2" : ""}`}>
                  {task.label}
                </p>
                <span className={`ml-auto font-comic-body text-[10px] font-bold uppercase tracking-wider ${done ? "text-[var(--green)] opacity-70" : "opacity-30"}`}>
                  {done ? "done" : "running"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Post-processing phase */}
        {allParallelDone && (
          <>
            <p className="font-comic-title text-xs uppercase tracking-widest opacity-40 mb-3 px-3 animate-fadeInUp">
              Processing
            </p>
            <div className="space-y-0.5 animate-fadeInUp">
              {POST_TASKS.map((task, i) => {
                const done = i < activePostIndex;
                const active = i === activePostIndex;
                const future = i > activePostIndex;
                return (
                  <div
                    key={task.label}
                    className={`flex items-center gap-3 py-2 px-3 transition-all duration-300 ${future ? "opacity-20" : done ? "opacity-50" : "opacity-100"
                      }`}
                  >
                    <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                      {done ? (
                        <svg className="w-4 h-4 text-[var(--green)] animate-checkPop" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : active ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] loading-stage-pulse" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--foreground)]/20" />
                      )}
                    </div>
                    <p className={`font-comic-body text-sm font-bold leading-tight ${done ? "line-through decoration-[var(--green)] decoration-2" : ""}`}>
                      {task.label}
                    </p>
                    {(done || active) && (
                      <span className={`ml-auto font-comic-body text-[10px] font-bold uppercase tracking-wider ${done ? "text-[var(--green)] opacity-70" : "opacity-30"}`}>
                        {done ? "done" : "running"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border border-[var(--border-light)] bg-[var(--surface)]">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
        </span>
        <span className="font-comic-body text-xs font-bold opacity-50 tabular-nums tracking-wide">
          {Math.floor(elapsed / 1000)}s elapsed
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStart, setLoadingStart] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "available" | "taken">("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.5);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) { setError("Enter a domain or keyword"); return; }
    setLoading(true);
    setLoadingStart(Date.now());
    setError(null);
    setResults([]);
    setSearchedKeyword(keyword);
    setFilter("all");
    try {
      const result = await searchDomainsAction(keyword.trim());
      if (!result.success) throw new Error(result.error || "Search failed");
      setResults(result.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const hasSearched = !!searchedKeyword;

  /* ── Shared search bar ── */
  const searchBar = (compact?: boolean) => (
    <form onSubmit={handleSearch} className={compact ? "max-w-2xl mx-auto" : "w-full"}>
      <div className={`flex items-stretch border-2 border-[var(--border)] bg-[var(--surface)] search-glow transition-all ${compact ? "shadow-[3px_3px_0px_var(--border)]" : "shadow-[4px_4px_0px_var(--border)]"}`}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="search for a domain name..."
          className={`font-comic-body flex-1 bg-transparent text-[var(--foreground)] placeholder-[var(--foreground)]/30 focus:outline-none ${compact ? "px-4 py-3 text-base" : "px-5 py-4 text-lg"} font-bold`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className={`font-comic-title shrink-0 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)] uppercase tracking-wider transition-opacity hover:opacity-90 ${loading ? "cursor-wait" : ""} ${compact ? "px-5 text-base" : "px-7 text-lg"}`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-current bounce-dot" />
              <span className="w-2.5 h-2.5 rounded-full bg-current bounce-dot" style={{ animationDelay: "0.15s" }} />
              <span className="w-2.5 h-2.5 rounded-full bg-current bounce-dot" style={{ animationDelay: "0.3s" }} />
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <SearchIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Search</span>
            </span>
          )}
        </button>
      </div>
    </form>
  );

  /* ── Domain card ── */
  const card = (result: DomainResult, index: number) => (
    <div
      key={`${result.domain}-${index}`}
      className={`p-3 sm:p-4 md:p-5 border-2 transition-all animate-fadeInUp flex flex-col ${result.available
        ? "border-[var(--border)] bg-[var(--surface)] shadow-[3px_3px_0px_var(--border)] hover:shadow-[1px_1px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px]"
        : "border-[var(--border-light)] bg-[var(--surface-muted)]"
        }`}
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="font-comic-title text-lg sm:text-xl md:text-2xl uppercase tracking-wide break-all">{result.domain}</p>
            {result.available ? (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold uppercase text-[var(--green)] tracking-wide">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Available
              </span>
            ) : (
              <span className="shrink-0 px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--foreground)]/40 tracking-wide">
                Taken
              </span>
            )}
          </div>
          <p className="text-xs font-bold opacity-50 mt-1 flex flex-wrap items-center gap-1.5">
            <span>{result.tld}</span>
            {result.matchType === "similar" && (
              <span className="px-1 py-px border border-[var(--border-light)] text-[10px] uppercase">similar</span>
            )}
            {result.source && <span className="opacity-60">· {result.source}</span>}
          </p>
        </div>

        {!result.available && (result.registration?.contactEmail || result.registration?.contactPhone) && (
          <a
            href={result.registration!.contactEmail ? `mailto:${result.registration!.contactEmail}` : `tel:${result.registration!.contactPhone!.replace(/\D/g, "")}`}
            className="shrink-0 font-comic-title px-3 py-1.5 text-xs uppercase border-2 border-[var(--border)] tracking-wide bg-[var(--surface)] hover:bg-[var(--foreground)] hover:text-[var(--surface)] transition-colors whitespace-nowrap"
          >
            Contact
          </a>
        )}
      </div>

      {/* Buy links for available domains */}
      {result.available && result.buyLinks && result.buyLinks.length > 0 && (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {result.buyLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold transition-all ${link.isCheapest
                  ? "bg-[var(--foreground)] text-[var(--background)] border-2 border-[var(--foreground)] shadow-[2px_2px_0px_var(--accent)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                  : "border border-[var(--border-light)] hover:border-[var(--border)] bg-[var(--surface)]"
                  }`}
              >
                <span className="font-comic-title uppercase tracking-wide">{link.name}</span>
                {link.price && <span className={link.isCheapest ? "font-comic-title" : "opacity-70"}>{link.price}</span>}
                {link.isCheapest && <StarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--accent)]" />}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* RDAP info for taken domains */}
      {!result.available && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)] text-xs opacity-80 space-y-1.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <p><span className="font-bold uppercase opacity-60">Registrar:</span> {result.registration?.registrar ?? "—"}</p>
            <p><span className="font-bold uppercase opacity-60">Registered:</span> {formatDate(result.registration?.created)}</p>
            <p><span className="font-bold uppercase opacity-60">Expires:</span> {formatDate(result.registration?.expires)}</p>
            {result.registration?.registrant && (
              <p><span className="font-bold uppercase opacity-60">Owner:</span> {result.registration.registrant}</p>
            )}
          </div>
          {(result.registration?.contactEmail || result.registration?.contactPhone || result.registration?.contactAddress) && (
            <div className="pt-1 space-y-0.5">
              {result.registration.contactEmail && (
                <p><span className="font-bold uppercase opacity-60">Email:</span> <a href={`mailto:${result.registration.contactEmail}`} className="underline hover:no-underline break-all">{result.registration.contactEmail}</a></p>
              )}
              {result.registration.contactPhone && (
                <p><span className="font-bold uppercase opacity-60">Phone:</span> <a href={`tel:${result.registration.contactPhone.replace(/\D/g, "")}`} className="underline hover:no-underline">{result.registration.contactPhone}</a></p>
              )}
              {result.registration.contactAddress && (
                <p><span className="font-bold uppercase opacity-60">Address:</span> <span className="break-words">{result.registration.contactAddress}</span></p>
              )}
            </div>
          )}
          {result.registration?.status && result.registration.status.length > 0 && (
            <p className="pt-0.5">
              <span className="font-bold uppercase opacity-60">Status:</span>{" "}
              {formatStatus(result.registration.status)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  /* ── List row ── */
  const listRow = (result: DomainResult, index: number) => {
    const cheapest = result.buyLinks?.find((l) => l.isCheapest);
    return (
      <div
        key={`${result.domain}-${index}`}
        className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-[var(--border-light)] transition-all animate-fadeInUp ${result.available ? "hover:bg-[var(--surface)]" : "opacity-70"
          }`}
        style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
      >
        {/* Domain + badge */}
        <div className="flex items-center gap-2 sm:min-w-[260px]">
          <p className="font-comic-title text-base sm:text-lg uppercase tracking-wide break-all">{result.domain}</p>
          {result.available ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold uppercase text-[var(--green)] tracking-wide">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span className="hidden xs:inline">Available</span>
            </span>
          ) : (
            <span className="shrink-0 text-[11px] font-bold uppercase text-[var(--foreground)]/40 tracking-wide">Taken</span>
          )}
        </div>

        {/* Price or RDAP details for taken */}
        <div className="flex-1 min-w-0">
          {result.available && cheapest ? (
            <span className="font-comic-body text-sm font-bold">
              from <span className="text-[var(--green)]">{cheapest.price}</span>
              <span className="opacity-40 ml-1">· {cheapest.name}</span>
            </span>
          ) : !result.available ? (
            result.registration ? (
              <div className="font-comic-body text-xs opacity-70 space-y-0.5">
                <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {result.registration.registrar && <span>{result.registration.registrar}</span>}
                  {result.registration.created && <span>reg {formatDate(result.registration.created)}</span>}
                  {result.registration.expires && <span>exp {formatDate(result.registration.expires)}</span>}
                </span>
                {result.registration.registrant && (
                  <span className="block truncate" title={result.registration.registrant}>Owner: {result.registration.registrant}</span>
                )}
              </div>
            ) : (
              <span className="font-comic-body text-xs opacity-50 italic">Details unavailable (often privacy protected)</span>
            )
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {result.available && result.buyLinks && result.buyLinks.length > 0 ? (
            <>
              {result.buyLinks.slice(0, 3).map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-all ${link.isCheapest
                    ? "bg-[var(--foreground)] text-[var(--background)] border border-[var(--foreground)]"
                    : "border border-[var(--border-light)] hover:border-[var(--border)]"
                    }`}
                >
                  <span className="font-comic-title uppercase tracking-wide">{link.name}</span>
                  {link.price && <span className="opacity-70">{link.price}</span>}
                  {link.isCheapest && <StarIcon className="w-3 h-3 text-[var(--accent)]" />}
                </a>
              ))}
              {result.buyLinks.length > 3 && (
                <span className="text-[10px] font-bold opacity-40">+{result.buyLinks.length - 3}</span>
              )}
            </>
          ) : !result.available && (result.registration?.contactEmail || result.registration?.contactPhone) ? (
            <a
              href={result.registration!.contactEmail ? `mailto:${result.registration!.contactEmail}` : `tel:${result.registration!.contactPhone!.replace(/\D/g, "")}`}
              className="font-comic-title px-2.5 py-1 text-xs uppercase border border-[var(--border-light)] hover:border-[var(--border)] tracking-wide transition-colors"
            >
              Contact
            </a>
          ) : null}
        </div>
      </div>
    );
  };

  /* ── Render helper: grid of cards or list of rows ── */
  /* On mobile (< md) always show cards; list view only on md+ */
  const renderResults = (items: DomainResult[]) =>
    viewMode === "card" ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((r, i) => card(r, i))}
      </div>
    ) : (
      <>
        {/* Card fallback for mobile */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {items.map((r, i) => card(r, i))}
        </div>
        {/* List view for md+ */}
        <div className="hidden md:block border-t border-[var(--border-light)]">
          {items.map((r, i) => listRow(r, i))}
        </div>
      </>
    );

  return (
    <div className={`bg-[var(--background)] text-[var(--foreground)] flex flex-col ${!hasSearched ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none halftone" />

      {/* ── Navbar ── */}
      <nav className="relative z-10 py-3 sm:py-4 px-4 sm:px-6 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setSearchedKeyword(null); setResults([]); setError(null); setFilter("all"); }}
            className="font-comic-title text-2xl uppercase tracking-wide hover:opacity-70 transition-opacity"
          >
            Donadomains
          </button>
          <ThemeSwitcher />
        </div>
      </nav>

      {/* ── Pre-search landing ── */}
      {!hasSearched ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6">
          <div className="w-full max-w-xl text-center space-y-4 sm:space-y-6 md:space-y-8">
            <div className="space-y-1.5 sm:space-y-2 md:space-y-3">
              <h1 className="font-comic-title text-2xl sm:text-4xl md:text-5xl uppercase tracking-wide leading-tight">
                Domain search, <span className="comic-highlight">sorted</span>
              </h1>
              <p className="font-comic-body text-xs sm:text-base md:text-lg text-[var(--foreground)]/60 max-w-lg mx-auto">
                One search. Prices from GoDaddy, Namecheap & more. RDAP lookups for taken domains.
              </p>
            </div>

            {searchBar()}

            {error && (
              <p className="text-sm font-bold text-[var(--accent-red,#ff5252)]">{error}</p>
            )}

            <div className="pt-1 sm:pt-2">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-30 mb-2 sm:mb-3">Try searching</p>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {HOT_DOMAINS.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => { setKeyword(domain); setError(null); }}
                    className="font-comic-body px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold border border-[var(--border-light)] bg-[var(--surface)] hover:border-[var(--border)] transition-colors"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Post-search header with compact search ── */}
          <div className="relative z-10 px-4 sm:px-6 md:px-8 pt-2 pb-4 sm:pb-6">
            <div className="max-w-6xl mx-auto">
              {searchBar(true)}
            </div>
          </div>

          {/* ── Results ── */}
          <div className="flex-1 px-4 sm:px-6 md:px-8 pb-12">
            <div className="max-w-6xl mx-auto">
              {error && (
                <div className="mb-6 p-4 border-2 border-[var(--border)] bg-[var(--surface)] text-center">
                  <span className="font-comic-title text-lg uppercase">Oops! </span>
                  <span className="font-bold">{error}</span>
                </div>
              )}

              {loading && <LoadingStages startTime={loadingStart} />}

              {!loading && results.length > 0 && (() => {
                const availableResults = results.filter(r => r.available);
                const takenResults = results.filter(r => !r.available);
                const filtered = filter === "all" ? results : results.filter((r) => filter === "available" ? r.available : !r.available);
                const searchedLower = (searchedKeyword ?? "").toLowerCase().trim();
                const userTypedTld = searchedLower.includes(".");
                const userSearchedResult = userTypedTld ? filtered.find((r) => r.domain.toLowerCase() === searchedLower) ?? null : null;
                const restResults = filtered.filter((r) => r.domain !== userSearchedResult?.domain);
                const restAvailable = restResults.filter((r) => r.available);
                const restTaken = restResults.filter((r) => !r.available);

                return (
                  <div>
                    {/* Toolbar: count + filters + view toggle */}
                    <div className="flex flex-wrap items-center gap-3 mb-8">
                      <h2 className="font-comic-title text-xl sm:text-2xl uppercase tracking-wide mr-auto">
                        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                      </h2>

                      <div className="flex gap-1 overflow-x-auto">
                        {(["all", "available", "taken"] as const).map((f) => {
                          const count = f === "all" ? results.length : f === "available" ? availableResults.length : takenResults.length;
                          const label = f === "all" ? "All" : f === "available" ? "Available" : "Taken";
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setFilter(f)}
                              className={`px-2.5 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide transition-all border whitespace-nowrap ${filter === f
                                ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                                : "bg-[var(--surface)] text-[var(--foreground)] border-[var(--border-light)] hover:border-[var(--border)]"
                                }`}
                            >
                              {label} <span className="opacity-60">{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* View toggle — hidden on mobile since card is always used */}
                      <div className="hidden md:flex border border-[var(--border-light)]">
                        <button
                          type="button"
                          onClick={() => setViewMode("card")}
                          className={`p-1.5 transition-colors ${viewMode === "card" ? "bg-[var(--foreground)] text-[var(--background)]" : "hover:bg-[var(--surface-muted)]"}`}
                          aria-label="Card view"
                        >
                          <GridIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("list")}
                          className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-[var(--foreground)] text-[var(--background)]" : "hover:bg-[var(--surface-muted)]"}`}
                          aria-label="List view"
                        >
                          <ListIcon />
                        </button>
                      </div>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="text-center py-16">
                        <p className="font-comic-title text-xl uppercase opacity-50">No {filter} domains found</p>
                        <button type="button" onClick={() => setFilter("all")} className="mt-3 font-bold underline text-sm hover:opacity-80">
                          Show all
                        </button>
                      </div>
                    ) : userTypedTld ? (
                      <>
                        {userSearchedResult && (
                          <div className="mb-8">
                            {viewMode === "card" ? card(userSearchedResult, 0) : listRow(userSearchedResult, 0)}
                          </div>
                        )}
                        {restAvailable.length > 0 && (
                          <div className="mb-10">
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 opacity-60">Also available</h3>
                            {renderResults(restAvailable)}
                          </div>
                        )}
                        {restTaken.length > 0 && (
                          <div>
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 opacity-40">Taken</h3>
                            {renderResults(restTaken)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {restAvailable.length > 0 && (
                          <div className="mb-10">
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
                              Available — register now
                            </h3>
                            {renderResults(restAvailable)}
                          </div>
                        )}
                        {restTaken.length > 0 && (
                          <div>
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 opacity-40">Taken</h3>
                            {renderResults(restTaken)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {!loading && searchedKeyword && results.length === 0 && !error && (
                <div className="text-center py-20">
                  <p className="font-comic-title text-2xl uppercase tracking-wide">
                    No results for &quot;{searchedKeyword}&quot;
                  </p>
                  <p className="font-comic-body mt-2 opacity-50">Try a different keyword or domain name</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 z-50 h-10 w-10 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)] border-2 border-[var(--foreground)] shadow-[2px_2px_0px_var(--border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}

      {/* ── Footer ── */}
      <footer className={`text-center ${!hasSearched ? 'py-2 sm:py-3' : 'py-5'}`}>
        <p className="text-xs font-bold uppercase tracking-widest opacity-25">
          A Donalabs product · {new Date().getFullYear()}
        </p>
        <p className="text-[10px] sm:text-xs opacity-30 mt-1">
          made with love in 🇮🇳
        </p>
      </footer>
    </div>
  );
}
