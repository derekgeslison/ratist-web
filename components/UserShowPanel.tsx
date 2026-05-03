"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Eye, Check, Bookmark, BookmarkCheck, AlertCircle, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import MarkSeenModal from "./MarkSeenModal";

interface UserRating {
  ratistRating: number | null;
  overallRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
}

interface CommunityAvg {
  ratistRating: number | null;
  ratistSum: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
}

interface Props {
  tmdbId: number;
  showName: string;
  posterPath: string | null;
  tmdbScore: number | null;
  seasons?: { season_number: number; name: string; episode_count: number }[];
}

/** Hybrid community rating: TMDB score acts as 50 buffer reviews, replaced 1-for-1 by real Ratist reviews */
function hybridCommunityRating(tmdbScore: number | null, count: number, ratistSum: number | null): number | null {
  if (tmdbScore == null) return null;
  const buffer = Math.max(0, 50 - count);
  const totalWeight = buffer + count;
  if (totalWeight === 0) return null;
  const sum = (tmdbScore * buffer) + (ratistSum ?? 0);
  return Math.round((sum / totalWeight) * 10) / 10;
}

export default function UserShowPanel({ tmdbId, showName, posterPath, tmdbScore, seasons }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [seen, setSeen] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingStatus, setRatingStatus] = useState<string | null>(null);
  const [communityAvg, setCommunityAvg] = useState<CommunityAvg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [markingSeen, setMarkingSeen] = useState(false);
  const [markingWL, setMarkingWL] = useState(false);
  const [showSeenModal, setShowSeenModal] = useState(false);
  const [showListPicker, setShowListPicker] = useState(false);
  const [allLists, setAllLists] = useState<{ id: string; name: string; isDefault: boolean; isOwned?: boolean; ownerName?: string; hasMovie: boolean }[]>([]);
  const [togglingListId, setTogglingListId] = useState<string | null>(null);

  const count = communityAvg?.count ?? 0;
  const communityHybrid = hybridCommunityRating(tmdbScore, count, communityAvg?.ratistSum ?? null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoaded(true); setSeen(false); setWatchlisted(false); return; }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/shows/${tmdbId}/seen`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      setSeen(!!data.seen);
      setWatchlisted(!!data.watchlisted);
      setUserRating(data.rating ?? null);
      setRatingStatus(data.ratingStatus ?? null);
      setCommunityAvg(data.communityAvg ?? null);
    })
    .catch(() => {})
    .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user, tmdbId, authLoading]);

  const [seenError, setSeenError] = useState<string | null>(null);

  async function toggleSeen() {
    if (!user || markingSeen) return;
    setMarkingSeen(true);
    setSeenError(null);
    const token = await user.getIdToken();
    const res = await fetch(`/api/shows/${tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: showName, poster_path: posterPath }),
    }).catch(() => null);
    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.hasRating) {
        setSeenError("You can't un-mark this as seen because you have a rating for it. Delete your rating first.");
        setTimeout(() => setSeenError(null), 5000);
      } else if (data.hasEpisodes) {
        setSeenError(data.error ?? "You have episodes marked as seen. Remove them first.");
        setTimeout(() => setSeenError(null), 6000);
      }
      setMarkingSeen(false);
      return false;
    } else if (res?.ok) {
      const data = await res.json();
      setSeen(data.seen);
      setMarkingSeen(false);
      return data.seen as boolean;
    }
    setMarkingSeen(false);
    return false;
  }

  async function handleSeenClick() {
    if (!user || markingSeen) return;
    if (seen) { toggleSeen(); return; }
    // Tap when not seen: mark show as seen FIRST, then surface the
    // optional series/seasons follow-up modal. Closing the modal
    // (X / click-away) leaves the show marked seen.
    const nowSeen = await toggleSeen();
    if (nowSeen && seasons && seasons.length > 0) {
      setShowSeenModal(true);
    }
  }

  async function handleWatchlistClick() {
    if (!user) return;
    // Tap behavior:
    //   - Already watchlisted (on ANY list): always just open the
    //     picker. autoAddToDefaultWatchlist does NOT apply once an
    //     item is on a list — the user manages membership explicitly
    //     so a tap can't silently strip or duplicate it.
    //   - Not on any list:
    //       autoAddToDefault = true, single list  → add to default
    //         (one-tap convenience, no picker).
    //       autoAddToDefault = true, 2+ lists     → add to default
    //         AND open picker so the user can branch onto others.
    //       autoAddToDefault = false              → open picker only.
    setMarkingWL(true);
    try {
      const token = await user.getIdToken();
      const listsRes = await fetch(`/api/shows/${tmdbId}/watchlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listsRes.ok) return;
      const listsData = await listsRes.json();
      const lists = listsData.lists ?? [];
      const autoAddToDefault: boolean = listsData.userSettings?.autoAddToDefaultWatchlist ?? true;
      const isWatchlisted = lists.some((l: { hasMovie: boolean }) => l.hasMovie);

      if (isWatchlisted) {
        setAllLists(lists);
        setShowListPicker(true);
        return;
      }

      if (!autoAddToDefault) {
        setAllLists(lists);
        setShowListPicker(true);
        return;
      }

      // Auto-add to default.
      const res = await fetch(`/api/shows/${tmdbId}/watchlist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: showName, poster_path: posterPath }),
      });
      if (res.ok) {
        const data = await res.json();
        setWatchlisted(data.watchlisted ?? true);
      }

      if (lists.length >= 2) {
        const defaultId = lists.find((l: { isDefault: boolean; id: string }) => l.isDefault)?.id;
        const updated = lists.map((l: { id: string; hasMovie: boolean }) => (
          l.id === defaultId ? { ...l, hasMovie: true } : l
        ));
        setAllLists(updated);
        setShowListPicker(true);
      }
    } finally {
      setMarkingWL(false);
    }
  }

  async function openListPicker() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/shows/${tmdbId}/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.lists) {
      setAllLists(data.lists);
      setShowListPicker(true);
    }
  }

  // Inline create form state for the picker — mirrors UserMoviePanel.
  const [creatingNewList, setCreatingNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListPrivate, setNewListPrivate] = useState(false);
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);

  async function handleCreateAndAdd() {
    if (!user || !newListName.trim() || creatingSubmitting) return;
    setCreatingSubmitting(true);
    try {
      const token = await user.getIdToken();
      const createRes = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim(), description: null, isPrivate: newListPrivate }),
      });
      if (!createRes.ok) return;
      const createData = await createRes.json();
      const list = createData.watchlist;
      if (!list?.id) return;
      await fetch(`/api/watchlist/${list.id}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, title: showName, posterPath, mediaType: "tv" }),
      });
      setAllLists((prev) => [...prev, { id: list.id, name: list.name ?? newListName.trim(), isDefault: false, isOwned: true, hasMovie: true }]);
      setWatchlisted(true);
      setCreatingNewList(false);
      setNewListName("");
      setNewListPrivate(false);
    } finally {
      setCreatingSubmitting(false);
    }
  }

  async function toggleListMembership(listId: string) {
    if (!user) return;
    setTogglingListId(listId);
    const token = await user.getIdToken();
    const list = allLists.find((l) => l.id === listId);
    if (!list) { setTogglingListId(null); return; }

    if (list.hasMovie) {
      // Remove from this list. The watchlist detail GET flattens both
      // movies and shows into `movies`; the unified DELETE endpoint
      // tries WatchlistMovie then falls through to WatchlistShow.
      // Previous code hit non-existent /shows paths and silently
      // failed.
      const res = await fetch(`/api/watchlist/${listId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const entries: Array<{ id: string; tmdbId: number }> = data.movies ?? [];
      const entry = entries.find((s) => s.tmdbId === tmdbId);
      if (entry) {
        await fetch(`/api/watchlist/${listId}/movies/${entry.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      }
      const updated = allLists.map((l) => l.id === listId ? { ...l, hasMovie: false } : l);
      setAllLists(updated);
      setWatchlisted(updated.some((l) => l.hasMovie));
    } else {
      // Add to this list — unified POST endpoint, mediaType:"tv" writes
      // a WatchlistShow row.
      await fetch(`/api/watchlist/${listId}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, title: showName, posterPath, mediaType: "tv" }),
      });
      const updated = allLists.map((l) => l.id === listId ? { ...l, hasMovie: true } : l);
      setAllLists(updated);
      setWatchlisted(true);
    }
    setTogglingListId(null);
  }

  const ratistScore = userRating?.ratistRating ?? null;
  const overallScore = userRating?.overallRating ?? null;
  const displayScore = ratistScore ?? overallScore;

  return (
    <div className="space-y-4">
      {/* Ratist Community Rating */}
      {communityHybrid != null && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
            Ratist Community Rating
            {count > 0 && <span className="ml-1 normal-case">· {count} Ratist review{count !== 1 ? "s" : ""}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: scoreColor(communityHybrid) }} />
            <span className="text-lg font-bold" style={{ color: scoreColor(communityHybrid) }}>
              {communityHybrid.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Personal rating or estimate */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
          {displayScore != null ? "Your Rating" : "Your Score Estimate"}
        </span>
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="R" width={16} height={16} className="w-4 h-4 opacity-80" />
          {displayScore != null ? (
            <span className="text-lg font-bold" style={{ color: scoreColor(displayScore) }}>
              {displayScore.toFixed(1)}
            </span>
          ) : (
            <span className="text-lg font-bold text-[var(--foreground-muted)] cursor-help" title="Not enough Ratist reviews for this show to generate a personalized estimate yet">
              –
            </span>
          )}
        </div>
        {displayScore == null && (
          <span className="text-xs text-[var(--foreground-muted)]">Rate this show to get your real score</span>
        )}
      </div>

      {/* Action buttons */}
      {loaded && (
        <>
          {user ? (<>
            <div className="flex flex-wrap gap-2">
              <div>
                <Link
                  href={`/shows/${tmdbId}/rate`}
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                    ratingStatus === "incomplete"
                      ? "border border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white"
                      : "border border-[var(--ratist-red)] text-[var(--ratist-red)] hover:bg-[var(--ratist-red)] hover:text-white"
                  }`}
                >
                  {ratingStatus === "complete" ? (
                    <><Check className="w-4 h-4" /> Edit Rating</>
                  ) : ratingStatus === "incomplete" ? (
                    <><AlertCircle className="w-4 h-4" /> Complete Rating</>
                  ) : (
                    <><Star className="w-4 h-4" /> Rate Show</>
                  )}
                </Link>
                <p className="text-[10px] text-[var(--foreground-muted)] mt-1 text-center">Series, seasons, or both</p>
              </div>
              <div className="relative">
                <button
                  onClick={handleSeenClick}
                  disabled={markingSeen}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                    seen
                      ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-white hover:border-[var(--ratist-red)]"
                  }`}
                >
                  {seen ? <><Check className="w-4 h-4" /> Seen</> : <><Eye className="w-4 h-4" /> {markingSeen ? "..." : "Mark Seen"}</>}
                </button>
                {seenError && (
                  <div className="absolute top-full left-0 mt-2 z-30 w-64 bg-[var(--surface)] border border-red-500/50 rounded-lg px-3 py-2 shadow-xl text-xs text-red-400">
                    {seenError}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={handleWatchlistClick}
                  disabled={markingWL}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                    watchlisted
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-white hover:border-[var(--ratist-red)]"
                  }`}
                >
                  {watchlisted ? <><BookmarkCheck className="w-4 h-4" /> Watchlisted</> : <><Bookmark className="w-4 h-4" /> {markingWL ? "..." : "Watchlist"}</>}
                </button>
                {showListPicker && allLists.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-xl z-30 p-2">
                    {creatingNewList ? (
                      <div className="space-y-2 p-1">
                        <p className="text-xs text-[var(--foreground-muted)] px-1">New list</p>
                        <input
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="List name"
                          autoFocus
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                        />
                        <label className="flex items-center gap-1.5 text-[11px] text-[var(--foreground-muted)] cursor-pointer px-1">
                          <input
                            type="checkbox"
                            checked={newListPrivate}
                            onChange={(e) => setNewListPrivate(e.target.checked)}
                            className="accent-[var(--ratist-red)]"
                          />
                          Private list
                        </label>
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleCreateAndAdd}
                            disabled={!newListName.trim() || creatingSubmitting}
                            className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {creatingSubmitting ? "..." : "Create & add"}
                          </button>
                          <button
                            onClick={() => { setCreatingNewList(false); setNewListName(""); setNewListPrivate(false); }}
                            className="px-2.5 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-xs rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-[var(--foreground-muted)] px-2 py-1 mb-1">Manage watchlists</p>
                        {allLists.map((list) => (
                          <button
                            key={list.id}
                            onClick={() => toggleListMembership(list.id)}
                            disabled={togglingListId === list.id}
                            className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-lg hover:bg-[var(--surface)] transition-colors disabled:opacity-50"
                          >
                            <span className="text-white truncate">
                              {list.name}
                              {list.isDefault && <span className="text-[var(--foreground-muted)] text-xs ml-1">(default)</span>}
                              {list.ownerName && <span className="text-[var(--foreground-muted)] text-xs ml-1">· {list.ownerName}</span>}
                            </span>
                            {list.hasMovie ? (
                              <Check className="w-4 h-4 text-green-400 shrink-0" />
                            ) : (
                              <span className="w-4 h-4 border border-[var(--border)] rounded shrink-0" />
                            )}
                          </button>
                        ))}
                        <button
                          onClick={() => setCreatingNewList(true)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Create new list
                        </button>
                        <button
                          onClick={() => setShowListPicker(false)}
                          className="w-full text-center text-xs text-[var(--foreground-muted)] hover:text-white mt-1 py-1 transition-colors"
                        >
                          Done
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              <a href="/auth/sign-in" className="text-[var(--ratist-red)] hover:underline">Sign in</a>{" "}to track shows you&apos;ve watched.
            </p>
          )}
        </>
      )}
      {showSeenModal && seasons && (
        <MarkSeenModal
          showTmdbId={tmdbId}
          showName={showName}
          posterPath={posterPath}
          seasons={seasons}
          onClose={() => setShowSeenModal(false)}
          onComplete={(showSeen) => setSeen(showSeen)}
        />
      )}
    </div>
  );
}
