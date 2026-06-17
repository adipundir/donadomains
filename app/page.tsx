"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { fetchDomainIntelAction, notifyDomainAction, valuateDomainAction } from "./actions";
import type { DomainIntel, DomainResult, DomainValuation } from "./types";

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
  if (!iso) return "–";
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

const TIER_COLORS = {
  common: "border-[var(--border-light)] text-[var(--foreground)]/60",
  decent: "border-blue-400 text-blue-500",
  premium: "border-purple-400 text-purple-500",
  ultra: "border-amber-400 text-amber-500",
} as const;

const TIER_BG = {
  common: "bg-[var(--surface-muted)]",
  decent: "bg-blue-50 dark:bg-blue-950/20",
  premium: "bg-purple-50 dark:bg-purple-950/20",
  ultra: "bg-amber-50 dark:bg-amber-950/20",
} as const;

function ValuationDisplay({ valuation }: { valuation: DomainValuation }) {
  return (
    <div className={`mt-3 p-3 border-2 ${TIER_COLORS[valuation.tier]} ${TIER_BG[valuation.tier]}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-comic-title text-2xl">{valuation.score}</span>
          <span className="font-comic-title text-xs uppercase tracking-wide opacity-60">/100</span>
          <span className={`font-comic-title text-xs uppercase tracking-wide px-2 py-0.5 border ${TIER_COLORS[valuation.tier]}`}>
            {valuation.tier}
          </span>
        </div>
        <span className="font-comic-title text-sm tracking-wide">{valuation.estimatedValue}</span>
      </div>
      <p className="font-comic-body text-xs opacity-60 mb-2">{valuation.reasoning}</p>
      <div className="flex flex-wrap gap-1.5">
        {valuation.factors.map((f) => (
          <span
            key={f.label}
            className={`font-comic-body text-xs px-1.5 py-0.5 border ${
              f.impact === "positive" ? "border-green-300 text-green-600 dark:text-green-400" :
              f.impact === "negative" ? "border-red-300 text-red-500 dark:text-red-400" :
              "border-[var(--border-light)] opacity-60"
            }`}
            title={f.detail}
          >
            {f.impact === "positive" ? "+" : f.impact === "negative" ? "-" : "·"} {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Domain Intel Panel (slide-over) ── */
/* ── Watch Form (inside intel panel) ── */
function NotifyForm({ domain }: { domain: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.SyntheticEvent) => {
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
      <p className="font-comic-title text-xs uppercase tracking-wide mb-2">Notify when available</p>
      <p className="font-comic-body text-sm opacity-60 mb-3">
        Get an email when this domain becomes available to register.
      </p>

      {status === "success" ? (
        <div className="flex items-center gap-2 p-3 border border-[var(--green,#22c55e)]/30 bg-[var(--surface)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--green,#22c55e)] shrink-0">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-comic-body text-xs">{message}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            placeholder="your@email.com"
            className="font-comic-body flex-1 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border-light)] focus:border-[var(--border)] focus:outline-none"
            disabled={status === "loading"}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="font-comic-title px-4 py-2 text-xs uppercase tracking-wide border-2 border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {status === "loading" ? "..." : "Notify Me"}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="font-comic-body text-xs text-red-400 mt-2">{message}</p>
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
        <span className="font-comic-title text-xs uppercase tracking-wide opacity-60">{label}</span>
        <span className="font-comic-body text-base break-all">{value}</span>
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
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs uppercase tracking-wide border border-[var(--border)] opacity-60">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    Registered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs uppercase tracking-wide text-[var(--green)] border border-[var(--green)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                    Available
                  </span>
                )
              )}
            </div>
            <p className="font-comic-body text-xs opacity-60">Domain Intelligence</p>
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
              <p className="font-comic-title text-2xl uppercase">Something went wrong</p>
              <p className="font-comic-body text-sm mt-2 opacity-60">{error}</p>
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
                      <p className="font-comic-title text-xs uppercase tracking-wide mb-1.5">Owner</p>
                      {intel.registrant && <p className="font-comic-body text-base">{intel.registrant}</p>}
                      {intel.organization && intel.organization !== intel.registrant && (
                        <p className="font-comic-body text-sm opacity-60 mt-0.5">{intel.organization}</p>
                      )}
                    </div>
                  )}

                  {/* ── Key Dates ── */}
                  <div>
                    <p className="font-comic-title text-xs uppercase tracking-wide mb-2.5">Key Dates</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Created", value: intel.created },
                        { label: "Updated", value: intel.updated },
                        { label: "Expires", value: intel.expires },
                      ].map(({ label, value }) => (
                        <div key={label} className="p-3 border-2 border-[var(--border-light)] bg-[var(--surface)] text-center">
                          <p className="font-comic-title text-xs uppercase tracking-wide opacity-60">{label}</p>
                          <p className="font-comic-body text-sm mt-1">
                            {value ? formatDate(value) : "–"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Registration Details ── */}
                  {(intel.registrar || intel.registrarUrl) && (
                    <div>
                      <p className="font-comic-title text-xs uppercase tracking-wide mb-2.5">Registration</p>
                      <div className="space-y-0.5">
                        {intelRow("Registrar", intel.registrar)}
                        {intelRow("Registrar URL", intel.registrarUrl)}
                      </div>
                    </div>
                  )}

                  {/* ── Contact Info ── */}
                  {(intel.contactEmail || intel.contactPhone || intel.contactAddress) && (
                    <div>
                      <p className="font-comic-title text-xs uppercase tracking-wide mb-2.5">Contact</p>
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
                      <p className="font-comic-title text-xs uppercase tracking-wide mb-2.5">Technical</p>
                      <div className="space-y-0.5">
                        {intelRow("DNSSEC", intel.dnssec)}

                        {intel.nameservers && intel.nameservers.length > 0 && (
                          <div className="flex flex-col gap-1 py-2.5 border-b border-[var(--border-light)]">
                            <span className="font-comic-title text-xs uppercase tracking-wide opacity-60">Nameservers</span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {intel.nameservers.map((ns) => (
                                <span key={ns} className="font-comic-body text-xs px-2 py-1 border border-[var(--border-light)] bg-[var(--surface)]">
                                  {ns}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {intel.status && intel.status.length > 0 && (
                          <div className="flex flex-col gap-1 py-2.5 border-b border-[var(--border-light)]">
                            <span className="font-comic-title text-xs uppercase tracking-wide opacity-60">Status</span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {intel.status.map((s) => (
                                <span key={s} className="font-comic-body text-xs px-2 py-1 border border-[var(--border-light)] bg-[var(--surface)]">
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
                <p className="font-comic-body text-xs uppercase tracking-wide opacity-60">
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

  const names = Object.keys(statuses);
  const total = names.length;
  const doneCount = names.filter((n) => statuses[n] !== "loading").length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total && total > 0;

  useEffect(() => {
    if (allDone) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      500,
    );
    return () => clearInterval(id);
  }, [startTime, allDone]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {names.map((name) => {
            const s = statuses[name];
            return (
              <span
                key={name}
                className={`font-comic-title text-xs uppercase tracking-wide ${
                  s === "done"
                    ? "opacity-60"
                    : s === "failed"
                    ? "opacity-60 line-through"
                    : "opacity-60"
                }`}
              >
                {s === "done" ? "✓" : s === "failed" ? "✗" : "·"} {name}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {resultCount > 0 && (
            <span className="font-comic-body text-xs opacity-60">
              {resultCount} result{resultCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="font-comic-body text-xs opacity-60 tabular-nums">
            {elapsed}s
          </span>
        </div>
      </div>
      <div className="w-full h-[3px] bg-[var(--border-light)] overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ease-out ${allDone ? "bg-[var(--foreground)]" : "bg-[var(--foreground)]/50"}`}
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
  const [loadingStart, setLoadingStart] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "available" | "taken">("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [intelDomain, setIntelDomain] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [registrarStatuses, setRegistrarStatuses] = useState<Record<string, RegistrarStatus>>({});
  const [valuations, setValuations] = useState<Record<string, { loading: boolean; valuation?: DomainValuation; error?: string }>>({});
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.5);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleValuate = useCallback(async (domain: string, result: DomainResult) => {
    // Toggle off if already shown
    if (valuations[domain]?.valuation) {
      setValuations((prev) => { const next = { ...prev }; delete next[domain]; return next; });
      return;
    }
    setValuations((prev) => ({ ...prev, [domain]: { loading: true } }));
    const cheapest = result.buyLinks?.find((l) => l.isCheapest);
    const res = await valuateDomainAction(domain, {
      registered: !result.available,
      isPremium: result.buyLinks?.some((l) => l.premium),
      registrationPrice: cheapest?.priceNum,
    });
    if (res.success && res.valuation) {
      setValuations((prev) => ({ ...prev, [domain]: { loading: false, valuation: res.valuation } }));
    } else {
      setValuations((prev) => ({ ...prev, [domain]: { loading: false, error: res.error || "Failed" } }));
    }
  }, [valuations]);

  const handleSearch = useCallback(async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!keyword.trim()) { setError("Enter a domain or keyword"); return; }

    // Cancel any in-flight search
    searchAbortRef.current?.abort();
    const abort = new AbortController();
    searchAbortRef.current = abort;

    setLoading(true);
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

          let event: { type: string; registrars?: string[]; registrar?: string; registrarStatus?: string; results?: DomainResult[]; };
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
          placeholder="Search for a domain name…"
          className={`font-comic-body flex-1 bg-transparent text-[var(--foreground)] placeholder-[var(--foreground)]/40 focus:outline-none ${compact ? "px-4 py-3 text-base" : "px-5 py-4 text-lg"}`}
        />
        <button
          type="submit"
          className={`font-comic-title shrink-0 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)] uppercase tracking-wide transition-opacity hover:opacity-90 ${compact ? "px-5 text-base" : "px-7 text-lg"}`}
        >
          <span className="flex items-center gap-2">
            <SearchIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Search</span>
          </span>
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
            <p className="font-comic-title text-lg sm:text-2xl uppercase tracking-wide break-all">{result.domain}</p>
            {result.available ? (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs sm:text-xs uppercase text-[var(--green)] tracking-wide">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Available
              </span>
            ) : (
              <span className="shrink-0 px-2 py-0.5 text-xs uppercase opacity-60 tracking-wide">
                Taken
              </span>
            )}
          </div>
          {result.matchType === "similar" && (
            <p className="text-xs opacity-60 mt-1">
              <span className="px-1.5 py-0.5 border border-[var(--border-light)] text-xs uppercase">similar</span>
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleValuate(result.domain, result)}
            disabled={valuations[result.domain]?.loading}
            className={`shrink-0 font-comic-title px-3 py-1.5 text-xs uppercase tracking-wide border-2 transition-all ${
              valuations[result.domain]?.valuation
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--foreground)] hover:text-[var(--surface)]"
            } disabled:opacity-60`}
          >
            {valuations[result.domain]?.loading ? "Evaluating..." : valuations[result.domain]?.valuation ? "Hide Evaluation" : "Evaluate"}
          </button>
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
      </div>

      {/* Buy links for available domains */}
      {result.available && result.buyLinks && result.buyLinks.length > 0 ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {result.buyLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm transition-all ${link.premium
                  ? "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 hover:border-amber-600"
                  : link.isCheapest
                  ? "bg-[var(--foreground)] text-[var(--background)] border-2 border-[var(--foreground)] shadow-[2px_2px_0px_var(--accent)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                  : "border border-[var(--border-light)] hover:border-[var(--border)] bg-[var(--surface)]"
                  }`}
              >
                {link.premium && <span className="text-xs text-amber-600 dark:text-amber-400">Premium</span>}
                <span>{link.name}</span>
                {link.price && <span>{link.price}</span>}
                {link.isCheapest && !link.premium && <StarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--accent)]" />}
              </a>
            ))}
          </div>
        </div>
      ) : result.available && loading ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <p className="font-comic-title text-xs uppercase tracking-wide opacity-60 loading-ellipsis">Comparing prices</p>
        </div>
      ) : result.available && (!result.buyLinks || result.buyLinks.length === 0) ? (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-light)]">
          <p className="font-comic-body text-sm opacity-60">No registrar pricing found. Search directly on registrar sites to purchase.</p>
        </div>
      ) : null}

      {/* Taken domain note */}
      {!result.available && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
          <p className="font-comic-body text-sm opacity-60">This domain is taken.</p>
        </div>
      )}

      {/* Valuation result */}
      {valuations[result.domain]?.valuation && (
        <div className="mt-2">
          <ValuationDisplay valuation={valuations[result.domain].valuation!} />
        </div>
      )}
      {valuations[result.domain]?.error && (
        <p className="font-comic-body text-xs text-red-400 mt-2">{valuations[result.domain].error}</p>
      )}
    </div>
  );

  /* ── List row ── */
  const listRow = (result: DomainResult, index: number) => {
    const cheapest = result.buyLinks?.find((l) => l.isCheapest);
    return (
      <div
        key={`${result.domain}-${index}`}
        className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-[var(--border-light)] transition-all animate-fadeInUp ${result.available ? "hover:bg-[var(--surface)]" : "opacity-60"
          }`}
        style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
      >
        {/* Domain + badge */}
        <div className="flex items-center gap-2 sm:min-w-[260px]">
          <p className="font-comic-title text-base sm:text-lg uppercase tracking-wide break-all">{result.domain}</p>
          {result.available ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs uppercase text-[var(--green)] tracking-wide">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span className="hidden xs:inline">Available</span>
            </span>
          ) : (
            <span className="shrink-0 text-xs uppercase text-[var(--foreground)]/60 tracking-wide">Taken</span>
          )}
        </div>

        {/* Price or RDAP details for taken */}
        <div className="flex-1 min-w-0">
          {result.available && cheapest ? (
            <span className="font-comic-body text-sm">
              from <span className="text-[var(--green)]">{cheapest.price}</span>
              <span className="opacity-60 ml-1">· {cheapest.name}</span>
            </span>
          ) : !result.available ? (
            <span className="font-comic-body text-xs opacity-60 italic">Taken</span>
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
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-all ${link.premium
                    ? "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : link.isCheapest
                    ? "bg-[var(--foreground)] text-[var(--background)] border border-[var(--foreground)]"
                    : "border border-[var(--border-light)] hover:border-[var(--border)]"
                    }`}
                >
                  {link.premium && <span className="font-comic-title text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Premium</span>}
                  <span className="font-comic-title uppercase tracking-wide">{link.name}</span>
                  {link.price && <span className="opacity-60">{link.price}</span>}
                  {link.isCheapest && !link.premium && <StarIcon className="w-3 h-3 text-[var(--accent)]" />}
                </a>
              ))}
              {result.buyLinks.length > 3 && (
                <span className="text-xs opacity-60">+{result.buyLinks.length - 3}</span>
              )}
            </>
          ) : result.available && loading ? (
            <span className="font-comic-title text-xs uppercase tracking-wide opacity-60 loading-ellipsis">Comparing</span>
          ) : !result.available ? (
            <button
              type="button"
              onClick={() => setIntelDomain(result.domain)}
              className="font-comic-title px-2.5 py-1 text-xs uppercase border border-[var(--border-light)] hover:border-[var(--border)] tracking-wide transition-colors"
            >
              More Details
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleValuate(result.domain, result)}
            disabled={valuations[result.domain]?.loading}
            className={`font-comic-title px-2.5 py-1 text-xs uppercase tracking-wide transition-colors ${
              valuations[result.domain]?.valuation
                ? "border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                : "border border-[var(--border-light)] hover:border-[var(--border)]"
            } disabled:opacity-60`}
          >
            {valuations[result.domain]?.loading ? "..." : valuations[result.domain]?.valuation ? "Hide" : "Evaluate"}
          </button>
        </div>
        {/* Valuation result row */}
        {valuations[result.domain]?.valuation && (
          <div className="sm:col-span-full w-full">
            <ValuationDisplay valuation={valuations[result.domain].valuation!} />
          </div>
        )}
        {valuations[result.domain]?.error && (
          <p className="font-comic-body text-xs text-red-400 sm:col-span-full">{valuations[result.domain].error}</p>
        )}
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
            className="font-comic-title text-2xl uppercase tracking-wide hover:opacity-60 transition-opacity"
          >
            Donadomains
          </button>
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="/docs"
              className="font-comic-title text-xs sm:text-sm uppercase tracking-wide px-2.5 py-1 rounded transition-opacity hover:opacity-60"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              MCP
            </a>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      {/* ── Pre-search landing ── */}
      {!hasSearched ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-14">
          <div className="w-full max-w-xl text-center space-y-6 sm:space-y-8">
            <div className="space-y-3">
              <h1 className="font-comic-title text-4xl sm:text-5xl uppercase tracking-wide leading-tight">
                Domain search, <span className="comic-highlight">sorted</span>
              </h1>
              <p className="text-base sm:text-lg text-[var(--foreground)]/60 max-w-lg mx-auto">
                One search. Prices from GoDaddy, Namecheap & more.
              </p>
            </div>

            {searchBar()}

            {error && (
              <p className="text-sm text-[var(--accent-red,#ff5252)]">{error}</p>
            )}

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
                  <span>{error}</span>
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
                      <h2 className="font-comic-title text-2xl sm:text-2xl uppercase tracking-wide mr-auto">
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
                              className={`px-2.5 py-1.5 text-xs sm:text-sm uppercase tracking-wide transition-all border whitespace-nowrap ${filter === f
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
                        <p className="font-comic-title text-2xl uppercase opacity-60">No {filter} domains found</p>
                        <button type="button" onClick={() => setFilter("all")} className="mt-3 underline text-sm hover:opacity-60">
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
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 opacity-60">Taken</h3>
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
                              Available, register now
                            </h3>
                            {renderResults(restAvailable)}
                          </div>
                        )}
                        {restTaken.length > 0 && (
                          <div>
                            <h3 className="font-comic-title text-sm sm:text-base uppercase tracking-wide mb-4 opacity-60">Taken</h3>
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
                  <p className="font-comic-body mt-2 opacity-60">Try a different keyword or domain name</p>
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
    </div>
  );
}
