"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SignInLink from "./SignInLink";

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
  /** True when the title already has a flatrate streaming entry — in
   *  that case we don't show the toggle at all (there's nothing to
   *  notify). The parent component checks the providers data and
   *  only mounts this button when streaming is genuinely absent. */
  isAlreadyStreaming?: boolean;
}

/**
 * "Notify me when streaming" toggle. Sits below the Where to Watch
 * section on movie/show pages when the title is currently rent/buy
 * only (no flatrate). On click: POST/DELETE /api/streaming-watch.
 *
 * The cron sweep at /api/cron/streaming-watch-sweep polls TMDB daily
 * and fires a notification when a flatrate entry first appears,
 * stamping notifiedAt so the alert never re-fires.
 */
export default function StreamingWatchToggle({ tmdbId, mediaType, isAlreadyStreaming }: Props) {
  const { user } = useAuth();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || isAlreadyStreaming) {
      setWatching(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/streaming-watch?tmdbId=${tmdbId}&mediaType=${mediaType}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { watching?: boolean };
        if (!cancelled) setWatching(!!json.watching);
      } catch { /* leave null — button shows neutral */ }
    })();
    return () => { cancelled = true; };
  }, [user, tmdbId, mediaType, isAlreadyStreaming]);

  // Hide entirely when the title is already streaming — there's nothing
  // to alert about. The parent decides this from the watch-providers
  // payload so we don't need to redundantly fetch here.
  if (isAlreadyStreaming) return null;

  if (!user) {
    return (
      <SignInLink className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white border border-[var(--border)] rounded-full hover:border-[var(--ratist-red)] hover:text-[var(--ratist-red)] transition-colors">
        <Bell className="w-3.5 h-3.5" />
        Sign in to be notified when streaming
      </SignInLink>
    );
  }

  const onClick = async () => {
    if (busy || !user) return;
    setBusy(true);
    const next = !(watching ?? false);
    setWatching(next); // optimistic
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/streaming-watch`, {
        method: next ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType }),
      });
      if (!res.ok) setWatching(!next);
    } catch {
      setWatching(!next);
    } finally {
      setBusy(false);
    }
  };

  const isWatching = !!watching;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors disabled:opacity-60 ${
        isWatching
          ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/40 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20"
          : "border-[var(--border)] text-white hover:border-[var(--ratist-red)] hover:text-[var(--ratist-red)]"
      }`}
      aria-pressed={isWatching}
    >
      {isWatching ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      {isWatching ? "We'll notify you when streaming" : "Notify me when streaming"}
    </button>
  );
}
