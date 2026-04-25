"use client";

import { useState } from "react";
import { Bookmark, Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ListEntry {
  id: string;
  name: string;
  isDefault: boolean;
  isOwned: boolean;
  ownerName?: string;
  hasMovie: boolean; // legacy field name for movies; semantic for shows too
}

export interface UseWatchlistFlowOptions {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  releaseDate?: string | null;
  /** Called whenever the user-facing watchlisted state changes. The
   *  caller usually mirrors this into local state so the card's
   *  Watchlisted/Watchlist label updates without a refetch. */
  onWatchlistedChange?: (watchlisted: boolean) => void;
}

interface FlowResult {
  /** Click handler for the card's "Watchlist" button. */
  handleClick: (e: React.MouseEvent) => void | Promise<void>;
  /** True while a network call is in flight. */
  busy: boolean;
  /** Picker modal element to render. Renders nothing when closed; safe
   *  to drop in JSX unconditionally. */
  picker: React.ReactNode;
}

const MULTI_LIST_THRESHOLD = 2;

/**
 * Watchlist add/manage flow used across cards, list items, and the
 * detail-page panel. Behavior:
 *
 *   - Not logged in: noop. Callers gate on user themselves.
 *   - User has 0 or 1 watchlists: POST the toggle endpoint directly.
 *     The endpoint creates a default list if absent, so 0 / 1 are the
 *     same code path. Single-list users never see a picker.
 *   - User has 2+ watchlists: open a picker modal listing every list
 *     (owned + collaborated as editor) with a checkbox per list. The
 *     user can toggle membership on multiple lists from here.
 *
 * Why a hook + drop-in modal instead of a wrapping component: the
 * cards have very different button styling (overlay on poster,
 * row-icon, panel button) and re-rendering the modal at the card
 * level would be inside a <Link>, which hijacks click events. The
 * modal portals visually outside the link via fixed positioning so
 * clicks on it don't trigger card navigation.
 */
export function useWatchlistFlow(opts: UseWatchlistFlowOptions): FlowResult {
  const { user } = useAuth();
  const { tmdbId, mediaType, title, posterPath, releaseDate, onWatchlistedChange } = opts;
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lists, setLists] = useState<ListEntry[]>([]);

  const apiBase = mediaType === "tv" ? `/api/shows/${tmdbId}` : `/api/movies/${tmdbId}`;

  async function fetchLists(token: string): Promise<ListEntry[]> {
    const res = await fetch(`${apiBase}/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.lists ?? [];
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user || busy) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const fetched = await fetchLists(token);

      if (fetched.length < MULTI_LIST_THRESHOLD) {
        // 0 or 1 lists — toggle on the default. 0 case has the
        // endpoint create a default first.
        const body: Record<string, unknown> = { title, poster_path: posterPath };
        if (mediaType === "movie" && releaseDate !== undefined) body.release_date = releaseDate;
        const res = await fetch(`${apiBase}/watchlist`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.watchlisted === "boolean") onWatchlistedChange?.(data.watchlisted);
        }
        return;
      }

      // 2+ lists — open the picker.
      setLists(fetched);
      setPickerOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function toggleList(listId: string) {
    if (!user) return;
    const list = lists.find((l) => l.id === listId);
    if (!list) return;

    const token = await user.getIdToken();
    if (list.hasMovie) {
      // Already on this list — the unified GET endpoint returns both
      // movie and show entries flattened into `movies`; find ours by
      // tmdbId and DELETE by entry id (the unified DELETE handler
      // tries WatchlistMovie then falls through to WatchlistShow).
      const detailRes = await fetch(`/api/watchlist/${listId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!detailRes.ok) return;
      const detail = await detailRes.json();
      const entries: Array<{ id: string; tmdbId: number }> = detail.movies ?? [];
      const entry = entries.find((m) => m.tmdbId === tmdbId);
      if (!entry) return;
      await fetch(`/api/watchlist/${listId}/movies/${entry.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      // Unified POST endpoint — `mediaType: "tv"` writes a
      // WatchlistShow row, otherwise a WatchlistMovie row.
      const body: Record<string, unknown> = { tmdbId, title, posterPath, mediaType };
      if (releaseDate !== undefined) body.releaseDate = releaseDate;
      await fetch(`/api/watchlist/${listId}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    const updated = lists.map((l) => (l.id === listId ? { ...l, hasMovie: !l.hasMovie } : l));
    setLists(updated);
    onWatchlistedChange?.(updated.some((l) => l.hasMovie));
  }

  const picker = pickerOpen ? (
    <WatchlistPickerModal
      title={title}
      lists={lists}
      onToggle={toggleList}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

  return { handleClick, busy, picker };
}

interface PickerProps {
  title: string;
  lists: ListEntry[];
  onToggle: (listId: string) => Promise<void>;
  onClose: () => void;
}

function WatchlistPickerModal({ title, lists, onToggle, onClose }: PickerProps) {
  const [busyListId, setBusyListId] = useState<string | null>(null);

  async function onClickList(listId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busyListId) return;
    setBusyListId(listId);
    try { await onToggle(listId); } finally { setBusyListId(null); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[var(--ratist-red)]" /> Add to watchlist
            </h3>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5 truncate">{title}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-[var(--foreground-muted)] hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="space-y-1">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                onClick={(e) => onClickList(l.id, e)}
                disabled={busyListId === l.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                  l.hasMovie
                    ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/40"
                    : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--ratist-red)]/40"
                }`}
              >
                <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                  l.hasMovie
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "border-[var(--border)]"
                }`}>
                  {busyListId === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : l.hasMovie ? <Check className="w-3 h-3" /> : null}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">
                    {l.name}
                    {l.isDefault && <span className="text-[10px] text-[var(--foreground-muted)] ml-1.5">(default)</span>}
                  </span>
                  {!l.isOwned && l.ownerName && (
                    <span className="block text-[10px] text-[var(--foreground-muted)]">Shared by {l.ownerName}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
