"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  /** Per-page suffix for the localStorage dismissal key. /movies and
   *  /watchlist reveal different actions on long-press, so users
   *  should be able to learn each independently — dismissing one
   *  shouldn't preempt the other. */
  pageKey: string;
  /** Optional override for the hint text — keeps the body copy
   *  honest about which actions appear on this page. */
  message?: string;
}

/**
 * Inline hint shown above tile grids on touch devices, telling
 * users they can tap-and-hold a poster to reveal the action
 * buttons. Dismissable; remembers dismissal in localStorage so we
 * don't keep nagging. Only renders on hover-less / coarse-pointer
 * devices — desktop users get actions on hover and don't need this
 * prompt.
 */
export default function TapHoldHint({ pageKey, message }: Props) {
  const storageKey = `ratist:tapHoldHintDismissed:${pageKey}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;
    try {
      if (localStorage.getItem(storageKey) === "1") return;
    } catch { /* private mode — show anyway */ }
    setShow(true);
  }, [storageKey]);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(storageKey, "1"); } catch { /* private mode */ }
  }

  if (!show) return null;

  const defaultMessage = "Tip: tap and hold a poster to reveal actions like Seen and Watchlist.";
  return (
    <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 text-xs text-[var(--foreground)]">
      <span>{message ?? defaultMessage}</span>
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
