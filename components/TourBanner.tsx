"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "ratist:tour-banner-dismissed";

export default function TourBanner() {
  // null until we've checked storage — prevents a flash of the banner
  // on returning users who already dismissed it.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY);
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-[var(--surface-2)] border-y border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-[var(--ratist-red)] shrink-0" />
        <p className="text-sm text-white flex-1 min-w-0">
          <span className="font-semibold">New to The Ratist?</span>
          <span className="text-[var(--foreground-muted)]"> Take a quick tour of what makes us different.</span>
        </p>
        <Link
          href="/welcome"
          onClick={dismiss}
          className="text-xs sm:text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          Take the tour
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss tour banner"
          className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
