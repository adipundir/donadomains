"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { fetchDomainIntelAction, notifyDomainAction } from "./actions";
import type { DomainIntel, DomainResult, DomainRegistrationDetails, BuyLink } from "./types";

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

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  try {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
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

/** 5-year total cost: registration + 4 × renewal. Only shown when renewal price is known. */
function fiveYearCost(link: BuyLink): number | null {
  if (link.priceNum == null || link.renewalPriceNum == null) return null;
  return link.priceNum + 4 * link.renewalPriceNum;
}

function cheapest5yr(links?: BuyLink[]): { cost: number; name: string } | null {
  if (!links?.length) return null;
  let best: { cost: number; name: string } | null = null;
  for (const l of links) {
    const c = fiveYearCost(l);
    if (c != null && (best === null || c < best.cost)) {
      best = { cost: c, name: l.name };
    }
  }
  return best;
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

/* ── Domain Intel Panel (slide-over) ── */
/* ── Watch Form (inside intel panel) ── */
function NotifyForm({ domain }: { domain: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    const result = await notifyDomainAction(email.trim(), domain);
    if (result.success) {
      setStatus("success");
      setMessage("Check your email to verify and activate notifications.");
    } else {
      setStatus("error");
      setMessage(result.error || "Something went wrong");
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-[var(--border-light)]">
      <p className="font-comic-title text-xs uppercase tracking-widest mb-2">Notify when available</p>
      <p className="font-comic-body text-sm opacity-70 mb-3">
        Get an email when this domain becomes available to register.
      </p>

      {status === "success" ? (
        <div className="flex items-center gap-2 p-3 border border-[var(--green,#22c55e)]/30 bg-[var(--surface)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--green,#22c55e)] shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-comic-body text-xs font-bold">{message}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            placeholder="your@email.com"
            className="font-comic-body flex-1 px-3 py-2 text-sm font-bold bg-[var(--surface)] border border-[var(--border-light)] focus:border-[var(--border)] focus:outline-none"
            disabled={status === "loading"}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="font-comic-title px-4 py-2 text-xs uppercase tracking-wide border-2 border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === "loading" ? "..." : "Notify Me"}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="font-comic-body text-xs text-red-400 font-bold mt-2">{message}</p>
      )}
    </div>
  );
}

/* ── Domain Intel Panel (slide-over) ── */
function DomainIntelPanel({ domain, onClose }: { domain: string; onClose: () => void }) {
  const [intel, setIntel] = useState<DomainIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIntel(null);

    fetchDomainIntelAction(domain).then((result) => {
      if (cancelled) return;
      if (!result.success) setError(result.error || "Failed");
      else setIntel(result.intel ?? null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [domain]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const intelRow = (label: string, value?: string | null) => {
    if (!value) return null;
    return (
      <div className="flex flex-col gap-1 py-3 border-b border-[var(--border-light)]">
        <span className="font-comic-title text-[10px] uppercase tracking-widest opacity-50">{label}</span>
        <span className="font-comic-body text-[15px] font-bold break-all">{value}</span>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--background)] border-l-2 border-[var(--border)] shadow-[-4px_0_20px_rgba(0,0,0,0.15)] overflow-y-auto animate-slideInRight">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--background)] border-b-2 border-[var(--border)] px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="font-comic-title text-lg uppercase tracking-wide">{domain}</p>
              {!loading && intel && (
                intel.registered ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-[var(--border)] opacity-70">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    Registered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--green)] border border-[var(--green)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                    Available
                  </span>
                )
              )}
            </div>
            <p className="font-comic-body text-xs opacity-70">Domain Intelligence</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface-muted)] transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-[var(--accent)] loading-stage-pulse" />
                <span className="font-comic-title text-base uppercase tracking-wide">Gathering intelligence</span>
              </div>
              <p className="font-comic-body text-sm opacity-60">Checking RDAP, DNS & WHOIS records</p>
            </div>
          )}

          {error && (
            <div className="text-center py-16">
              <p className="font-comic-title text-xl uppercase">Something went wrong</p>
              <p className="font-comic-body text-sm mt-2 opacity-70">{error}</p>
            </div>
          )}

          {!loading && intel && (
            <div className="space-y-5">
              {!intel.registered && (
                <p className="font-comic-body text-sm">
                  This domain is not currently registered and may be available for purchase.
                </p>
              )}

              {intel.registered && (
                <>
                  {/* ── Owner Section ── */}
                  {(intel.registrant || intel.organization) && (
                    <div className="p-4 border-2 border-[var(--border-light)] bg-[var(--surface)]">
                      <p className="font-comic-title text-xs uppercase tracking-widest mb-1.5">Owner</p>
                      {intel.registrant && <p className="font-comic-body text-base font-bold">{intel.registrant}</p>}
                      {intel.organization && intel.organization !== intel.registrant && (
                        <p className="font-comic-body text-sm opacity-80 mt-0.5">{intel.organization}</p>
                      )}
                    </div>
                  )}

                  {/* ── Key Dates ── */}
                  <div>
                    <p className="font-comic-title text-xs uppercase tracking-widest mb-2.5">Key Dates</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Created", value: intel.created },
                        { label: "Updated", value: intel.updated },
                        { label: "Expires", value: intel.expires },
                      ].map(({ label, value }) => (
                        <div key={label} className="p-3 border-2 border-[var(--border-light)] bg-[var(--surface)] text-center">
                          <p className="font-comic-title text-[10px] uppercase tracking-widest opacity-50">{label}</p>
                          <p className="font-comic-body text-[13px] font-bold mt-1">
                            {value ? formatDate(value) : "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Registration Details ── */}
                  {(intel.registrar || intel.registrarUrl) && (
                    <div>
                      <p className="font-comic-title text-xs uppercase tracking-widest mb-2.5">Registration</p>
                      <div className="space-y-0.5">
                        {intelRow("Registrar", intel.registrar)}
                        {intelRow("Registrar URL", intel.registrarUrl)}
                      </div>
                    </div>
                  )}

                  {/* ── Contact Info ── */}
                  {(intel.contactEmail || intel.contactPhone || intel.contactAddress) && (
                    <div>
                      <p className="font-comic-title text-xs uppercase tracking-widest mb-2.5">Contact</p>
                      <div className="space-y-0.5">
                        {intelRow("Email", intel.contactEmail)}
                        {intelRow("Phone", intel.contactPhone)}
                        {intelRow("Address", intel.contactAddress)}
                      </div>
                      {/* Contact action buttons */}
                      <div className="mt-3 flex gap-2">
                        {intel.contactEmail && (
                          <a
                            href={`mailto:${intel.contactEmail}`}
                            className="flex-1 font-comic-title text-center px-4 py-2.5 text-sm uppercase tracking-wide border-2 border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] shadow-[3px_3px_0px_var(--border)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                          >
                            Email Owner
                          </a>
                        )}
                        {intel.contactPhone && (
                          <a
                            href={`tel:${intel.contactPhone.replace(/\D/g, "")}`}
                            className="flex-1 font-comic-title text-center px-4 py-2.5 text-sm uppercase tracking-wide border-2 border-[var(--border)] bg-[var(--surface)] shadow-[3px_3px_0px_var(--border)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                          >
                            Call
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Technical Details ── */}
                  {(intel.dnssec || (intel.nameservers && intel.nameservers.length > 0) || (intel.status && intel.status.length > 0)) && (
                    <div>
                      <p className="font-comic-title text-xs uppercase tracking-widest mb-2.5">Technical</p>
                      <div className="space-y-0.5">
                        {intelRow("DNSSEC", intel.dnssec)}

                        {intel.nameservers && intel.nameservers.length > 0 && (
                          <div className="flex flex-col gap-1 py-2.5 border-b border-[var(--border-light)]">
                            <span className="font-comic-title text-[10px] uppercase tracking-widest opacity-50">Nameservers</span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {intel.nameservers.map((ns) => (
                                <span key={ns} className="font-comic-body text-xs font-bold px-2 py-1 border border-[var(--border-light)] bg-[var(--surface)]">
                                  {ns}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {intel.status && intel.status.length > 0 && (
                          <div className="flex flex-col gap-1 py-2.5 border-b border-[var(--border-light)]">
                            <span className="font-comic-title text-[10px] uppercase tracking-widest opacity-50">Status</span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {intel.status.map((s) => (
                                <span key={s} className="font-comic-body text-xs font-bold px-2 py-1 border border-[var(--border-light)] bg-[var(--surface)]">
                                  {STATUS_LABELS[s] || s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Watch form */}
              {intel.registered && <NotifyForm domain={intel.domain} />}

              {/* Sources footer */}
              <div className="pt-4 border-t border-[var(--border-light)]">
                <p className="font-comic-body text-[11px] uppercase tracking-widest opacity-60">
                  Sources: {intel.sources.join(" → ")}
                  {Object.keys(intel.timing).length > 0 && (
                    <span className="ml-2">
                      ({Object.entries(intel.timing).map(([k, v]) => `${k}: ${v}ms`).join(", ")})
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type RegistrarStatus = "loading" | "done" | "failed";

function SearchProgress({
  statuses,
  resultCount,
  startTime,
}: {
  statuses: Record<string, RegistrarStatus>;
  resultCount: number;
  startTime: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [startTime]);

  const names = Object.keys(statuses);
  const total = names.length;
  // failed counts as done for the progress bar — no red crosses shown
  const doneCount = names.filter((n) => statuses[n] !== "loading").length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total && total > 0;

  return (
    <div className="mb-6 animate-fadeInUp">
      <div className="flex items-center justify-between mb-2">
        <span className="font-comic-title text-[10px] uppercase tracking-widest opacity-40">
          {allDone
            ? `${total} sources checked`
            : `Checking ${total} sources — ${doneCount}/${total}`}
        </span>
        <div className="flex items-center gap-3">
          {resultCount > 0 && (
            <span className="font-comic-body text-[10px] opacity-40">
              {resultCount} result{resultCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="font-comic-body text-[10px] opacity-30 tabular-nums">
            {elapsed}s
          </span>
        </div>
      </div>
      <div className="w-full h-[3px] bg-[var(--border-light)] overflow-hidden">
        <div
          className="h-full bg-[var(--foreground)] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [rdapDone, setRdapDone] = useState(false);
  const [loadingStart, setLoadingStart] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "available" | "taken">("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [intelDomain, setIntelDomain] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [registrarStatuses, setRegistrarStatuses] = useState<Record<string, RegistrarStatus>>({});
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.5);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!keyword.trim()) { setError("Enter a domain or keyword"); return; }

    // Cancel any in-flight search
    searchAbortRef.current?.abort();
    const abort = new AbortController();
    searchAbortRef.current = abort;

    setLoading(true);
    setRdapDone(false);
    setLoadingStart(Date.now());
    setError(null);
    setResults([]);
    setRegistrarStatuses({});
    setSearchedKeyword(keyword.trim());
    setFilter("all");

    try {
      console.log(`[Search] Fetching /api/search?q=${keyword.trim()}&stream=true`);
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(keyword.trim())}&stream=true`,
        { signal: abort.signal },
      );

      console.log(`[Search] Response: ${response.status} ${response.statusText}`);
      if (!response.ok || !response.body) throw new Error(`Search failed: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[Search] Stream closed by server");
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          let event: { type: string; registrars?: string[]; registrar?: string; registrarStatus?: string; results?: DomainResult[]; domain?: string; registration?: DomainRegistrationDetails; };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          console.log(`[Search] SSE event: type=${event.type}`, event.type === "batch"
            ? `registrar=${event.registrar} status=${event.registrarStatus} results=${event.results?.length ?? 0}`
            : event.type === "init" ? `registrars=${event.registrars?.join(",")}` : "");

          if (event.type === "init" && event.registrars) {
            const initial: Record<string, RegistrarStatus> = {};
            for (const name of event.registrars) initial[name] = "loading";
            setRegistrarStatuses(initial);
          } else if (event.type === "batch" && event.registrar) {
            if (event.results) setResults(event.results);
            setRegistrarStatuses((prev) => ({
              ...prev,
              [event.registrar!]: (event.registrarStatus === "ok" ? "done" : "failed") as RegistrarStatus,
            }));
          } else if (event.type === "complete") {
            console.log("[Search] Complete event received, stopping loading");
            setLoading(false);
          } else if (event.type === "rdap_done") {
            setRdapDone(true);
          } else if (event.type === "rdap_update" && event.domain && event.registration) {
            setResults((prev) =>
              prev.map((r) =>
                r.domain === (event as { domain: string }).domain
                  ? { ...r, registration: (event as { registration: unknown }).registration as typeof r.registration }
                  : r
              )
            );
          }
        }
      }

      // Safety net: ensure loading stops even if complete event was missed
      setLoading(false);
    } catch (err) {
      if (abort.signal.aborted) return;
      console.error("[Search] Error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      setLoading(false);
    }
  }, [keyword]);

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
              <span className="shrink-0 px-2 py-0.5 text-[11px] font-bold uppercase opacity-60 tracking-wide">
                Taken
              </span>
            )}
          </div>
          {result.matchType === "similar" && (
            <p className="text-xs font-bold opacity-60 mt-1">
              <span className="px-1.5 py-0.5 border border-[var(--border-light)] text-[10px] uppercase">similar</span>
            </p>
          )}
        </div>

        {!result.available && (
          <button
            type="button"
            onClick={() => setIntelDomain(result.domain)}
            className="shrink-0 font-comic-title px-3 py-1.5 text-xs uppercase border-2 border-[var(--border)] tracking-wide bg-[var(--surface)] hover:bg-[var(--foreground)] hover:text-[var(--surface)] transition-colors whitespace-nowrap"
          >
            More Details
          </button>
        )}
      </div>

      {/* Buy links for available domains */}
      {result.available && result.buyLinks && result.buyLinks.length > 0 ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {result.buyLinks.map((link) => {
              const total5yr = fiveYearCost(link);
              return (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex flex-col items-start px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold transition-all ${link.premium
                    ? "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 hover:border-amber-600"
                    : link.isCheapest
                    ? "bg-[var(--foreground)] text-[var(--background)] border-2 border-[var(--foreground)] shadow-[2px_2px_0px_var(--accent)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                    : "border border-[var(--border-light)] hover:border-[var(--border)] bg-[var(--surface)]"
                    }`}
                >
                  <span className="inline-flex items-center gap-1 sm:gap-1.5">
                    {link.premium && <span className="font-comic-title text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">Premium</span>}
                    {link.promo && !link.premium && <span className="font-comic-title text-[10px] uppercase tracking-wider text-orange-500">1st yr</span>}
                    <span className="font-comic-title uppercase tracking-wide">{link.name}</span>
                    {link.price && <span className={link.isCheapest && !link.premium ? "font-comic-title" : ""}>{link.price}</span>}
                    {link.isCheapest && !link.premium && <StarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--accent)]" />}
                    {link.cheapestLongTerm && !link.isCheapest && <span className="text-[9px] font-comic-title uppercase text-[var(--green)]">best value</span>}
                  </span>
                  {link.renewalPrice && (
                    <span className={`text-[10px] ${link.promo ? "text-red-500 font-bold" : link.renewalPriceNum != null && link.priceNum != null && link.renewalPriceNum >= link.priceNum * 2 ? "text-red-500 font-bold" : link.isCheapest ? "opacity-70" : "opacity-50"}`}>
                      {link.promo ? `then ${link.renewalPrice}` : `renews ${link.renewalPrice}`}
                    </span>
                  )}
                  {total5yr != null && (
                    <span className={`text-[10px] ${link.isCheapest ? "opacity-70" : "opacity-50"}`}>5yr: ${total5yr.toFixed(2)}</span>
                  )}
                </a>
              );
            })}
          </div>
          {(() => {
            const best5 = cheapest5yr(result.buyLinks);
            const cheapestReg = result.buyLinks.find((l) => l.isCheapest);
            // Only show if cheapest 5yr differs from cheapest registration price
            if (best5 && cheapestReg && best5.name !== cheapestReg.name) {
              return (
                <p className="mt-2 font-comic-body text-xs opacity-60">
                  Cheapest 5yr: <span className="font-bold">${best5.cost.toFixed(2)}</span> at <span className="font-bold">{best5.name}</span>
                </p>
              );
            }
            return null;
          })()}
        </div>
      ) : result.available && loading ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <p className="font-comic-title text-xs uppercase tracking-widest opacity-60 loading-ellipsis">Comparing prices</p>
        </div>
      ) : result.available && (!result.buyLinks || result.buyLinks.length === 0) ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <p className="font-comic-body text-sm opacity-60">No registrar pricing found — search directly on registrar sites to purchase.</p>
        </div>
      ) : null}

      {/* RDAP info for taken domains — single row */}
      {!result.available && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
          {result.registration?.registrar || result.registration?.expires || result.registration?.created || result.registration?.registrant ? (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {result.registration?.registrar && (
                <p><span className="font-comic-title text-xs uppercase tracking-wide opacity-60 mr-1.5">Registrar</span><span className="text-sm font-bold">{result.registration.registrar}</span></p>
              )}
              {result.registration?.registrant && (
                <p className="max-w-[220px] truncate"><span className="font-comic-title text-xs uppercase tracking-wide opacity-60 mr-1.5">Owner</span><span className="text-sm font-bold" title={result.registration.registrant}>{result.registration.registrant}</span></p>
              )}
              {result.registration?.created && (
                <p><span className="font-comic-title text-xs uppercase tracking-wide opacity-60 mr-1.5">Registered</span><span className="text-sm font-bold">{formatDate(result.registration.created)}</span></p>
              )}
              {result.registration?.expires && (() => {
                const days = daysUntil(result.registration.expires);
                return (
                  <p>
                    <span className="font-comic-title text-xs uppercase tracking-wide opacity-60 mr-1.5">Expires</span>
                    <span className="text-sm font-bold">{formatDate(result.registration.expires)}</span>
                    {days !== null && (
                      <span className={`ml-1.5 text-xs font-bold ${days <= 30 ? "text-red-500" : days <= 90 ? "text-orange-500" : "opacity-60"}`}>
                        ({days <= 0 ? "expired" : `${days}d left`})
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          ) : !rdapDone ? (
            <p className="font-comic-title text-xs uppercase tracking-widest opacity-60 loading-ellipsis">Fetching details</p>
          ) : (
            <p className="font-comic-body text-sm opacity-60">Registration details unavailable — often privacy protected</p>
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
              {cheapest.renewalPrice && (
                <span className={`ml-1 text-xs ${cheapest.renewalPriceNum != null && cheapest.priceNum != null && cheapest.renewalPriceNum >= cheapest.priceNum * 2 ? "text-red-500" : "opacity-40"}`}>
                  &rarr; {cheapest.renewalPrice}
                </span>
              )}
              <span className="opacity-40 ml-1">· {cheapest.name}</span>
              {(() => {
                const best5 = cheapest5yr(result.buyLinks);
                if (best5) {
                  return (
                    <span className="opacity-40 ml-2 text-xs">
                      · 5yr: ${best5.cost.toFixed(2)}{best5.name !== cheapest.name ? ` (${best5.name})` : ""}
                    </span>
                  );
                }
                return null;
              })()}
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
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-all ${link.premium
                    ? "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : link.isCheapest
                    ? "bg-[var(--foreground)] text-[var(--background)] border border-[var(--foreground)]"
                    : "border border-[var(--border-light)] hover:border-[var(--border)]"
                    }`}
                >
                  {link.premium && <span className="font-comic-title text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">Premium</span>}
                  {link.promo && !link.premium && <span className="font-comic-title text-[9px] uppercase tracking-wider text-orange-500">1st yr</span>}
                  <span className="font-comic-title uppercase tracking-wide">{link.name}</span>
                  {link.price && <span className="opacity-70">{link.price}</span>}
                  {link.renewalPrice && (
                    <span className={`text-[10px] ${link.promo ? "text-red-500 font-bold" : link.renewalPriceNum != null && link.priceNum != null && link.renewalPriceNum >= link.priceNum * 2 ? "text-red-500 font-bold" : "opacity-50"}`}>
                      {link.promo ? `then ${link.renewalPrice}` : `→ ${link.renewalPrice}`}
                    </span>
                  )}
                  {link.isCheapest && !link.premium && <StarIcon className="w-3 h-3 text-[var(--accent)]" />}
                  {link.cheapestLongTerm && !link.isCheapest && <span className="text-[8px] font-comic-title uppercase text-[var(--green)]">best value</span>}
                </a>
              ))}
              {result.buyLinks.length > 3 && (
                <span className="text-[10px] font-bold opacity-40">+{result.buyLinks.length - 3}</span>
              )}
            </>
          ) : result.available && loading ? (
            <span className="font-comic-title text-[10px] uppercase tracking-widest opacity-40 loading-ellipsis">Comparing</span>
          ) : !result.available ? (
            <button
              type="button"
              onClick={() => setIntelDomain(result.domain)}
              className="font-comic-title px-2.5 py-1 text-xs uppercase border border-[var(--border-light)] hover:border-[var(--border)] tracking-wide transition-colors"
            >
              More Details
            </button>
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
    <div className={`bg-[var(--background)] text-[var(--foreground)] flex flex-col ${!hasSearched ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}>
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
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="/docs"
              className="font-comic-title text-xs sm:text-sm uppercase tracking-wide opacity-60 hover:opacity-100 transition-opacity"
            >
              API
            </a>
            <ThemeSwitcher />
          </div>
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

              {Object.keys(registrarStatuses).length > 0 && (
                <SearchProgress
                  statuses={registrarStatuses}
                  resultCount={results.length}
                  startTime={loadingStart}
                />
              )}

              {/* Skeleton loading cards — shown before first results arrive */}
              {loading && results.length === 0 && (
                viewMode === "card" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="p-3 sm:p-4 md:p-5 border-2 border-[var(--border-light)] bg-[var(--surface-muted)] animate-pulse flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <div className="h-6 sm:h-7 rounded bg-[var(--border-light)]" style={{ width: `${100 + (i % 4) * 30}px` }} />
                              <div className="h-4 w-16 rounded bg-[var(--border-light)]" />
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            <div className="h-8 w-24 rounded bg-[var(--border-light)]" />
                            <div className="h-8 w-28 rounded bg-[var(--border-light)]" />
                            <div className="h-8 w-20 rounded bg-[var(--border-light)]" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Card fallback for mobile */}
                    <div className="grid grid-cols-1 gap-3 md:hidden">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="p-3 sm:p-4 md:p-5 border-2 border-[var(--border-light)] bg-[var(--surface-muted)] animate-pulse flex flex-col"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="h-6 rounded bg-[var(--border-light)]" style={{ width: `${100 + (i % 4) * 30}px` }} />
                            <div className="h-4 w-16 rounded bg-[var(--border-light)]" />
                          </div>
                          <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
                            <div className="flex gap-1.5">
                              <div className="h-8 w-24 rounded bg-[var(--border-light)]" />
                              <div className="h-8 w-28 rounded bg-[var(--border-light)]" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* List skeleton for md+ */}
                    <div className="hidden md:block border-t border-[var(--border-light)]">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-light)] animate-pulse"
                        >
                          <div className="flex items-center gap-2 min-w-[260px]">
                            <div className="h-5 rounded bg-[var(--border-light)]" style={{ width: `${120 + (i % 4) * 25}px` }} />
                            <div className="h-4 w-16 rounded bg-[var(--border-light)]" />
                          </div>
                          <div className="flex-1">
                            <div className="h-4 w-32 rounded bg-[var(--border-light)]" />
                          </div>
                          <div className="flex gap-2">
                            <div className="h-7 w-20 rounded bg-[var(--border-light)]" />
                            <div className="h-7 w-24 rounded bg-[var(--border-light)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              )}

              {results.length > 0 && (() => {
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

      {/* ── Domain Intel Panel ── */}
      {intelDomain && (
        <DomainIntelPanel domain={intelDomain} onClose={() => setIntelDomain(null)} />
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
