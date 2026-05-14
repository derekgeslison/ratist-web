"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Bell, X } from "lucide-react";
import { usePush } from "@/hooks/usePush";
import { useAuth } from "@/context/AuthContext";

/**
 * First-launch push permission prompt. Shows once for installed
 * surfaces (native Capacitor app, or PWA in standalone display mode).
 * Never shows in a regular browser tab — that would feel aggressive
 * and most users dismiss site-level notification prompts anyway.
 *
 * Three exit paths:
 *   • User taps "Enable" → triggers the OS permission dialog
 *   • User taps "Not now" → soft-dismiss; we re-ask on the next major
 *     visit (after a few days) since they may have just not been ready
 *   • User explicitly closes → permanently dismissed
 *
 * Persistence keys live in localStorage so a fresh install resets.
 */

const SOFT_DISMISS_KEY = "ratist:push-prompt-soft-dismissed-at";
const HARD_DISMISS_KEY = "ratist:push-prompt-hard-dismissed";
const SOFT_REPROMPT_DAYS = 4;

export default function FirstLaunchPushPrompt() {
  const { user } = useAuth();
  const { supported, isNative, permission, subscribed, busy, enable } = usePush();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user || !supported || subscribed || permission === "denied" || permission === "granted") {
      setOpen(false);
      return;
    }

    // Only prompt on installed surfaces. Regular browser tabs get the
    // existing /settings opt-in instead.
    const isPwaStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      ("standalone" in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (!isNative && !isPwaStandalone) {
      setOpen(false);
      return;
    }

    try {
      if (localStorage.getItem(HARD_DISMISS_KEY) === "1") {
        setOpen(false);
        return;
      }
      const softAt = localStorage.getItem(SOFT_DISMISS_KEY);
      if (softAt) {
        const ageDays = (Date.now() - Number(softAt)) / (1000 * 60 * 60 * 24);
        if (ageDays < SOFT_REPROMPT_DAYS) {
          setOpen(false);
          return;
        }
      }
    } catch { /* ignore */ }

    // Slight delay so it doesn't fire while the splash is still up.
    const t = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(t);
  }, [user, supported, isNative, subscribed, permission]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-5">
        <button
          type="button"
          onClick={() => {
            try { localStorage.setItem(HARD_DISMISS_KEY, "1"); } catch { /* ignore */ }
            setOpen(false);
          }}
          aria-label="Dismiss"
          className="absolute top-3 right-3 text-[var(--foreground-muted)] hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--ratist-red)]/15 border border-[var(--ratist-red)]/40 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[var(--ratist-red)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-1">Turn on notifications?</p>
            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed mb-4">
              Get pinged when friends rate something you watched, when comments roll in on your reviews, or when your watchlist movies become available. You can fine-tune which categories ping you in Settings.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await enable();
                  // Whether enable succeeded or not (e.g. user denied
                  // the OS prompt), close this card — they made a
                  // decision. If they want to retry they can use /settings.
                  try { localStorage.setItem(HARD_DISMISS_KEY, "1"); } catch { /* ignore */ }
                  setOpen(false);
                }}
                className="px-4 py-1.5 text-sm font-semibold rounded-full bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white transition-colors disabled:opacity-60"
              >
                {busy ? "…" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem(SOFT_DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
                  setOpen(false);
                }}
                className="px-4 py-1.5 text-sm font-medium rounded-full text-[var(--foreground-muted)] hover:text-white transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
