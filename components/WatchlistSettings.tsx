"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Settings, X, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export interface WatchlistSettingsValues {
  autoAddToDefaultWatchlist: boolean;
  autoSeenOnWatchlistCheck: boolean;
  autoRemoveFromWatchlistOnSeen: "none" | "all" | "default";
  defaultWatchlistFilter: "all" | "unwatched";
  watchlistAddPosition: "top" | "bottom";
  pinCheckedToBottom: boolean;
  watchlistStreamingNotifs: boolean;
}

interface Props {
  /** Optional callback when settings change so the parent page can
   *  re-render (e.g., re-applying the default filter). */
  onChange?: (settings: WatchlistSettingsValues) => void;
}

/**
 * Gear-icon button + modal panel for the per-user watchlist settings.
 * Drop into the /watchlist page header. Self-contained: fetches the
 * current values, posts updates inline. Uses createPortal for the
 * modal (consistent with WatchlistFlow's picker — keeps event
 * handling clean regardless of parent ancestry).
 */
export default function WatchlistSettings({ onChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<WatchlistSettingsValues>({
    autoAddToDefaultWatchlist: true,
    autoSeenOnWatchlistCheck: false,
    autoRemoveFromWatchlistOnSeen: "none",
    defaultWatchlistFilter: "all",
    watchlistAddPosition: "top",
    pinCheckedToBottom: false,
    watchlistStreamingNotifs: false,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lazy-load on first open. Re-fetching on every open would clobber
  // the optimistic local state if a save was in flight.
  useEffect(() => {
    if (!open || loaded || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/me/watchlist-settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as WatchlistSettingsValues;
        if (!cancelled) {
          setValues(data);
          setLoaded(true);
        }
      } catch { /* leave defaults */ }
    })();
    return () => { cancelled = true; };
  }, [open, loaded, user]);

  const update = useCallback(async (patch: Partial<WatchlistSettingsValues>) => {
    if (!user) return;
    // Optimistic local update so the UI feels responsive.
    setValues((prev) => ({ ...prev, ...patch }));
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/me/watchlist-settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as WatchlistSettingsValues;
        setValues(updated);
        onChange?.(updated);
      }
    } finally {
      setBusy(false);
    }
  }, [user, onChange]);

  const trigger = (
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
      aria-label="Watchlist settings"
    >
      <Settings className="w-3.5 h-3.5" />
      Settings
    </button>
  );

  if (!open || !mounted) return trigger;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-[var(--ratist-red)]" /> Watchlist Settings
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--foreground-muted)] hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!loaded && user && (
          <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!user && (
          <p className="text-sm text-[var(--foreground-muted)]">Sign in to manage your watchlist settings.</p>
        )}

        {loaded && user && (
          <div className="space-y-5">
            <ToggleRow
              label="Auto-add to default watchlist"
              description="When tapping the watchlist button on cards or pages, automatically add to your default watchlist. The picker still opens when you have multiple lists so you can also add to others."
              checked={values.autoAddToDefaultWatchlist}
              onChange={(v) => update({ autoAddToDefaultWatchlist: v })}
              disabled={busy}
            />

            <ChoiceRow
              label="Auto-remove when marked as seen"
              description="When you mark a movie or show as seen, optionally remove it from your watchlists."
              value={values.autoRemoveFromWatchlistOnSeen}
              options={[
                { value: "none", label: "Never" },
                { value: "default", label: "Default only" },
                { value: "all", label: "All watchlists" },
              ]}
              onChange={(v) => update({ autoRemoveFromWatchlistOnSeen: v as "none" | "all" | "default" })}
              disabled={busy}
            />

            <ToggleRow
              label="Default to “Unwatched” filter"
              description="Open watchlists with the unwatched-only filter applied automatically."
              checked={values.defaultWatchlistFilter === "unwatched"}
              onChange={(v) => update({ defaultWatchlistFilter: v ? "unwatched" : "all" })}
              disabled={busy}
            />

            <ToggleRow
              label="Send checked items to the bottom"
              description="Keep checked-off items visible but pushed below unchecked ones in any sort order. Doesn’t affect reorder mode."
              checked={values.pinCheckedToBottom}
              onChange={(v) => update({ pinCheckedToBottom: v })}
              disabled={busy}
            />

            <ChoiceRow
              label="Where to add new items"
              description="When adding a movie or show to a list, drop it at the top or bottom of the custom order."
              value={values.watchlistAddPosition}
              options={[
                { value: "top", label: "Top" },
                { value: "bottom", label: "Bottom" },
              ]}
              onChange={(v) => update({ watchlistAddPosition: v as "top" | "bottom" })}
              disabled={busy}
            />

            <ToggleRow
              label="Mark as seen when checked off"
              description="When you check an item off your watchlist, also mark it as seen in your diary."
              checked={values.autoSeenOnWatchlistCheck}
              onChange={(v) => update({ autoSeenOnWatchlistCheck: v })}
              disabled={busy}
            />

            <ToggleRow
              label="Notify me on streaming launches"
              description="When a movie or show on any of your watchlists starts streaming on Netflix, Prime, Disney+, Hulu, Max, Apple TV+, Peacock, or Paramount+. Sent as a single daily digest if multiple items launch the same day."
              checked={values.watchlistStreamingNotifs}
              onChange={(v) => update({ watchlistStreamingNotifs: v })}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {createPortal(modal, document.body)}
    </>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled }: {
  label: string; description: string; checked: boolean;
  onChange: (next: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function ChoiceRow({ label, description, value, options, onChange, disabled }: {
  label: string; description: string; value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="text-xs text-[var(--foreground-muted)] mt-0.5 mb-2 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            disabled={disabled}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
              value === o.value
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
