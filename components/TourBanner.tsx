"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "ratist:tour-banner-dismissed";

// Best-effort server write of the dismiss state. Fire-and-forget — if
// it fails (network blip, anonymous user, etc.) we still have the
// localStorage flag, and the next syncUser will eventually surface
// the server state on a future sign-in.
async function writeServerDismiss() {
  try {
    const { auth } = await import("@/lib/firebase");
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const token = await fbUser.getIdToken();
    await fetch("/api/me/tour-dismiss", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }
}

export default function TourBanner() {
  const { user, tourDismissedAt, markTourDismissed } = useAuth();
  // null until storage check + auth state settles — prevents a flash
  // of the banner on returning users who already dismissed it.
  const [localDismissed, setLocalDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setLocalDismissed(!!window.localStorage.getItem(DISMISS_KEY));
    } catch {
      setLocalDismissed(false);
    }
  }, []);

  // Lazy-backfill: if a signed-in user has localStorage-dismissed but
  // the server doesn't know yet, push it to the server so the dismiss
  // sticks across devices.
  useEffect(() => {
    if (user && localDismissed && !tourDismissedAt) {
      void writeServerDismiss();
    }
  }, [user, localDismissed, tourDismissedAt]);

  function dismiss(via: "x" | "take_tour") {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
    track(via === "take_tour" ? "tour_banner_taken" : "tour_banner_dismissed");
    setLocalDismissed(true);
    if (user) {
      markTourDismissed();
      void writeServerDismiss();
    }
  }

  // Hide if either storage path says dismissed. Wait for the storage
  // check to settle before deciding (prevents flash on returning users).
  if (localDismissed === null) return null;
  if (tourDismissedAt) return null;
  if (localDismissed) return null;

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
          onClick={() => dismiss("take_tour")}
          className="text-xs sm:text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          Take the tour
        </Link>
        <button
          onClick={() => dismiss("x")}
          aria-label="Dismiss tour banner"
          className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
