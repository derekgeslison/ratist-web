"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ShareButton from "./ShareButton";

/**
 * Engagement-gated word-of-mouth nudge. Pops a small "share this page"
 * card on shareable surfaces AFTER the user demonstrates they're
 * actually engaged — 30s on the page OR scrolled past 60%, whichever
 * fires first. Throttled by a 30%-per-visit coin flip so the same
 * engaged user doesn't get prompted on every page they read; once
 * dismissed it stays hidden site-wide for 7 days.
 *
 * Drop this on the bottom of pages that have OG cards / shareable
 * content (movie + show pages, celebrity pages, posts, collections,
 * forum threads, watch companion pages, etc.). Skip on browse pages,
 * user-specific pages, and anything that wouldn't look right with an
 * OG preview when shared.
 *
 * Reuses ShareButton so the actual share UX is identical to the
 * page-level ShareButton instances above the fold.
 */

const DISMISS_KEY = "ratist:share-nudge-dismissed-at";
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENGAGE_TIME_MS = 30 * 1000;
const ENGAGE_SCROLL_PCT = 60;
const SHOW_PROBABILITY = 0.3;

interface Props {
  /** The URL to share. Same shape ShareButton expects. */
  url: string;
  /** Default share text; copied to the user's clipboard / pre-filled
   *  on social-share targets. */
  text: string;
  /** Optional OG card image URL — enables the image preview / download
   *  affordances inside ShareButton. */
  cardImageUrl?: string;
  /** Forwarded straight to ShareButton — used by Watch Companion pages
   *  to carry the active season query param onto the shared URL. */
  forwardParams?: Array<{ from: string; toShare?: string; toCardImage?: string }>;
}

export default function ShareNudge({ url, text, cardImageUrl, forwardParams }: Props) {
  const [show, setShow] = useState(false);
  // Once an engagement signal has fired we lock in — clearing the
  // listeners and skipping further evaluation. Without this the
  // scroll listener could fire dozens of times after threshold.
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Recent dismissal? Bail without registering listeners. Stored as
    // a wall-clock timestamp; if parsing fails (corrupt / cleared)
    // we treat that as "never dismissed" rather than blocking show.
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const dismissedAt = parseInt(raw, 10);
        if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_WINDOW_MS) {
          return;
        }
      }
    } catch { /* private-mode storage error — proceed */ }

    // Coin flip per visit. Re-rolling on every mount means the user
    // sees the nudge on roughly 30% of qualifying page views without
    // ever feeling like the site is hammering them.
    if (Math.random() >= SHOW_PROBABILITY) return;

    function reveal() {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
      setShow(true);
    }

    function onScroll() {
      const doc = document.documentElement;
      // Total scrolled position vs total scrollable height. (scrollY +
      // viewport) / pageHeight — using the bottom of the viewport so
      // short pages where the user can't scroll 60% still count when
      // they've reached the bottom.
      const scrollPct = ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100;
      if (scrollPct >= ENGAGE_SCROLL_PCT) reveal();
    }

    const timer = setTimeout(reveal, ENGAGE_TIME_MS);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* private-mode storage error — fine, just won't persist */ }
  }

  if (!show) return null;

  return (
    <aside
      // max-w-md + mx-auto so the card doesn't stretch edge-to-edge —
      // it's a small CTA, not a full-width content block. On narrow
      // mobile viewports max-w caps above the screen width so the card
      // effectively fills (the parent page already has horizontal
      // padding via its own container, so the card never kisses the
      // screen edges).
      className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-4 sm:p-5 my-8 relative shadow-[0_0_20px_-12px_rgba(204,16,52,0.4)] max-w-md mx-auto"
      aria-label="Share this page"
    >
      <button
        onClick={dismiss}
        aria-label="Hide"
        className="absolute top-3 right-3 text-[var(--foreground-muted)] hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="text-sm font-semibold text-white mb-1 pr-6">Like what you see?</p>
      <p className="text-xs text-[var(--foreground-muted)] mb-3 max-w-md leading-snug">
        Help us get the word out — share this page wherever your friends are.
      </p>
      <ShareButton url={url} text={text} cardImageUrl={cardImageUrl} forwardParams={forwardParams} />
    </aside>
  );
}
