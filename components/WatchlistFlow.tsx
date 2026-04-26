"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, X, Loader2, Plus, Lock } from "lucide-react";
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
 * detail-page panel. Behavior is governed by the user's
 * autoAddToDefaultWatchlist setting (default true):
 *
 *   - autoAddToDefault = true (one-tap convenience):
 *     * 1 list → toggle on default, no picker.
 *     * 2+ lists → toggle on default AND open the picker so the
 *       user can also add to other lists.
 *   - autoAddToDefault = false (always pick explicitly):
 *     * Always open the picker, regardless of list count. Nothing
 *       is added until the user taps a list.
 *
 * Why a hook + drop-in modal: the cards have different button
 * styling (overlay on poster, row-icon, panel button); a wrapping
 * component would be too rigid. The picker modal portals to
 * document.body so it escapes the <Link> ancestor that wraps cards,
 * keeping click semantics clean.
 */
export function useWatchlistFlow(opts: UseWatchlistFlowOptions): FlowResult {
  const { user } = useAuth();
  const { tmdbId, mediaType, title, posterPath, releaseDate, onWatchlistedChange } = opts;
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lists, setLists] = useState<ListEntry[]>([]);

  const apiBase = mediaType === "tv" ? `/api/shows/${tmdbId}` : `/api/movies/${tmdbId}`;

  async function fetchListsWithSettings(token: string): Promise<{ lists: ListEntry[]; autoAddToDefault: boolean }> {
    const res = await fetch(`${apiBase}/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { lists: [], autoAddToDefault: true };
    const data = await res.json();
    return {
      lists: data.lists ?? [],
      // Defaults to true if the endpoint doesn't carry the setting
      // (older clients, anonymous, etc.) — preserves the existing UX.
      autoAddToDefault: data.userSettings?.autoAddToDefaultWatchlist ?? true,
    };
  }

  async function toggleDefaultEndpoint(token: string): Promise<{ watchlisted: boolean } | null> {
    const body: Record<string, unknown> = { title, poster_path: posterPath };
    if (mediaType === "movie" && releaseDate !== undefined) body.release_date = releaseDate;
    // Shows endpoint expects `name` instead of `title`.
    if (mediaType === "tv") body.name = title;
    const res = await fetch(`${apiBase}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user || busy) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const { lists: fetched, autoAddToDefault } = await fetchListsWithSettings(token);

      if (autoAddToDefault) {
        // Toggle the default list directly. Single-list users never
        // see the picker; multi-list users get both the toggle AND
        // a picker so they can add to other lists.
        const data = await toggleDefaultEndpoint(token);
        if (data && typeof data.watchlisted === "boolean") onWatchlistedChange?.(data.watchlisted);

        if (fetched.length >= MULTI_LIST_THRESHOLD) {
          // Reflect the just-toggled default state in the picker's
          // local copy so the checkboxes are accurate without a
          // refetch round-trip.
          const defaultId = fetched.find((l) => l.isDefault)?.id;
          const updated = fetched.map((l) => (
            l.id === defaultId ? { ...l, hasMovie: !l.hasMovie } : l
          ));
          setLists(updated);
          setPickerOpen(true);
        }
        return;
      }

      // autoAddToDefault = false: always show the picker, no auto-add.
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

  /**
   * Create a brand-new watchlist FROM the picker, then add the
   * current movie/show to it. Used when the user has a picker open
   * but realizes none of their existing lists fit. Returns true on
   * success so the picker UI can transition back to the list view.
   */
  async function createListAndAdd(opts: { name: string; description: string; isPrivate: boolean }): Promise<boolean> {
    if (!user) return false;
    const token = await user.getIdToken();
    const createRes = await fetch("/api/watchlist", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: opts.name.trim(),
        description: opts.description.trim() || null,
        isPrivate: opts.isPrivate,
      }),
    });
    if (!createRes.ok) return false;
    const createData = await createRes.json();
    const newList = createData.watchlist;
    if (!newList?.id) return false;

    // Add the current item to the brand-new list immediately.
    const body: Record<string, unknown> = { tmdbId, title, posterPath, mediaType };
    if (releaseDate !== undefined) body.releaseDate = releaseDate;
    await fetch(`/api/watchlist/${newList.id}/movies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLists((prev) => [
      ...prev,
      {
        id: newList.id,
        name: newList.name ?? opts.name.trim(),
        isDefault: false,
        isOwned: true,
        hasMovie: true,
      },
    ]);
    onWatchlistedChange?.(true);
    return true;
  }

  const picker = pickerOpen ? (
    <WatchlistPickerModal
      title={title}
      lists={lists}
      onToggle={toggleList}
      onCreate={createListAndAdd}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

  return { handleClick, busy, picker };
}

interface PickerProps {
  title: string;
  lists: ListEntry[];
  onToggle: (listId: string) => Promise<void>;
  onCreate: (opts: { name: string; description: string; isPrivate: boolean }) => Promise<boolean>;
  onClose: () => void;
}

function WatchlistPickerModal({ title, lists, onToggle, onCreate, onClose }: PickerProps) {
  const [busyListId, setBusyListId] = useState<string | null>(null);
  // Inline create-list view inside the picker modal. Toggled via
  // the "Create new list" button at the bottom of the list. Mirrors
  // the /watchlist page's create form (name + description + private)
  // so the experience is consistent across both entry points.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    const ok = await onCreate({ name: newName, description: newDesc, isPrivate: newPrivate });
    setSubmitting(false);
    if (ok) {
      setCreating(false);
      setNewName("");
      setNewDesc("");
      setNewPrivate(false);
    }
  }
  // Mount the modal via a portal to document.body so it escapes the
  // <Link> ancestor that the cards use as their click target. Without
  // a portal the modal is rendered inside the anchor; clicks on the
  // modal — even with stopPropagation — can still trigger the anchor's
  // navigation because the click "happens" inside the anchor's
  // descendant subtree from the browser's perspective. portaling out
  // of the anchor removes the ambiguity entirely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  async function onClickList(listId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busyListId) return;
    setBusyListId(listId);
    try { await onToggle(listId); } finally { setBusyListId(null); }
  }

  if (!mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
           onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[var(--ratist-red)]" /> Add to watchlist
            </h3>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5 truncate">{title}</p>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="text-[var(--foreground-muted)] hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {creating ? (
          <form onSubmit={handleCreateSubmit} onClick={(e) => e.stopPropagation()} className="space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="List name"
              autoFocus
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
            />
            <label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={newPrivate}
                onChange={(e) => setNewPrivate(e.target.checked)}
                className="accent-[var(--ratist-red)]"
              />
              <Lock className="w-3 h-3" /> Private list
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!newName.trim() || submitting}
                className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {submitting ? "Creating..." : `Create & add "${title}"`}
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCreating(false); }}
                className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
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
            <li>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCreating(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--ratist-red)]/60 text-[var(--foreground-muted)] hover:text-white text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Create new list
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
