"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "ratist:tapHoldHintDismissed";

/**
 * Inline hint shown above tile grids on touch devices, telling
 * users they can tap-and-hold a poster to reveal the action
 * buttons (Seen / Watchlist / etc.). Dismissable; remembers
 * dismissal in localStorage so we don't keep nagging. Only renders
 * on hover-less / coarse-pointer devices — desktop users get
 * actions on hover and don't need this prompt.
 */
export default function TapHoldHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch { /* private mode — show anyway */ }
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* private mode */ }
  }

  if (!show) return null;

  return (
    <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 text-xs text-[var(--foreground)]">
      <span>Tip: tap and hold a poster to reveal actions like Seen and Watchlist.</span>
      <button
        type="button"
        onClick={dismiss}
        className="text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0"
        aria-label="Dismiss tip"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
