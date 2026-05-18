"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyNotificationAction, unsubscribeAction } from "@/app/actions";

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const unwatch = params.get("unwatch");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [domain, setDomain] = useState("");

  useEffect(() => {
    if (unwatch) {
      unsubscribeAction(unwatch).then((r) => {
        setStatus(r.success ? "success" : "error");
        setMessage(r.success ? "Unsubscribed. You won't receive any more notifications for this domain." : (r.error || "Failed"));
      });
    } else if (token) {
      verifyNotificationAction(token).then((r) => {
        setStatus(r.success ? "success" : "error");
        setMessage(r.success ? "Email verified! We'll notify you when the domain becomes available." : (r.error || "Failed"));
        if (r.domain) setDomain(r.domain);
      });
    } else {
      setStatus("error");
      setMessage("Missing token");
    }
  }, [token, unwatch]);

  return (
    <>
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] loading-stage-pulse" />
          <span className="font-comic-body text-sm opacity-60">
            {unwatch ? "Unsubscribing..." : "Verifying..."}
          </span>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[var(--green,#22c55e)] bg-[var(--surface)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--green,#22c55e)]">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="font-comic-title uppercase tracking-wide text-sm">
              {unwatch ? "Unsubscribed" : "Verified"}
            </span>
          </div>
          <p className="font-comic-body">{message}</p>
          {domain && (
            <p className="font-comic-body text-sm opacity-60">
              Monitoring: <strong>{domain}</strong>
            </p>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-red-400 bg-[var(--surface)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span className="font-comic-title uppercase tracking-wide text-sm">Error</span>
          </div>
          <p className="font-comic-body">{message}</p>
        </div>
      )}
    </>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="font-comic-title text-2xl uppercase tracking-wide">Donadomains</h1>

        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-8">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] loading-stage-pulse" />
              <span className="font-comic-body text-sm opacity-60">Loading...</span>
            </div>
          }
        >
          <VerifyContent />
        </Suspense>

        <a
          href="/"
          className="inline-block mt-6 font-comic-title px-4 py-2 text-sm uppercase tracking-wide border-2 border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition-colors"
        >
          Back to Search
        </a>
      </div>
    </div>
  );
}
