"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

export function ThemeSwitcher() {
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

export function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4">
      {title && (
        <div
          className="font-comic-body text-xs px-4 py-1.5 rounded-t-lg"
          style={{
            background: "var(--surface-muted)",
            borderBottom: "1px solid var(--border-light)",
            color: "var(--foreground)",
            opacity: 0.7,
          }}
        >
          {title}
        </div>
      )}
      <div className="relative">
        <pre
          className={`overflow-x-auto p-4 text-sm leading-relaxed ${title ? "rounded-b-lg" : "rounded-lg"}`}
          style={{
            background: "#111111",
            color: "#e0e0e0",
          }}
        >
          <code>{children}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 right-2 px-2 py-1 text-xs rounded font-comic-body transition-colors"
          style={{
            background: copied ? "var(--green)" : "rgba(255,255,255,0.1)",
            color: copied ? "#fff" : "#aaa",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function TabbedCode({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(tabs[active].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4">
      <div className="flex" style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border-light)", borderRadius: "8px 8px 0 0" }}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(i)}
            className="font-comic-body text-xs px-4 py-1.5 transition-colors"
            style={{
              color: i === active ? "var(--foreground)" : "var(--foreground)",
              opacity: i === active ? 1 : 0.4,
              borderBottom: i === active ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre
          className="overflow-x-auto p-4 text-sm leading-relaxed rounded-b-lg"
          style={{ background: "#111111", color: "#e0e0e0" }}
        >
          <code>{tabs[active].code}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 right-2 px-2 py-1 text-xs rounded font-comic-body transition-colors"
          style={{
            background: copied ? "var(--green)" : "rgba(255,255,255,0.1)",
            color: copied ? "#fff" : "#aaa",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function SidebarNav({ items }: { items: { id: string; label: string; heading?: boolean }[] }) {
  const [activeSection, setActiveSection] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    // The last section can't naturally enter the observer's activation band
    // (top 20-40% of the viewport) because the page ends before it scrolls
    // that high. Force-activate it when the user has reached the bottom.
    const onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 64;
      if (atBottom && items.length > 0) {
        setActiveSection(items[items.length - 1].id);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [items]);

  return (
    <nav className="hidden lg:block w-44 shrink-0 sticky top-6 self-start">
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id} className={item.heading && i > 0 ? "pt-3" : ""}>
            <a
              href={`#${item.id}`}
              className={`block px-3 py-1.5 rounded transition-colors ${item.heading ? "text-xs font-comic-title uppercase tracking-wide" : "text-sm font-comic-body"}`}
              style={{
                background: activeSection === item.id ? "var(--surface-muted)" : "transparent",
                fontWeight: activeSection === item.id || item.heading ? 700 : 400,
                opacity: activeSection === item.id ? 1 : item.heading ? 0.5 : 0.7,
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CopyDocsButton() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      const res = await fetch("/llms-full.txt");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: open in new tab
      window.open("/llms-full.txt", "_blank");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="font-comic-title text-xs uppercase tracking-wide px-3 py-1.5 border-2 transition-all"
      style={{
        borderColor: copied ? "var(--green)" : "var(--border-light)",
        background: copied ? "var(--green)" : "transparent",
        color: copied ? "#fff" : "var(--foreground)",
      }}
    >
      {copied ? "Copied!" : "Copy docs for AI"}
    </button>
  );
}
