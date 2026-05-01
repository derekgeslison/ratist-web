"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, BookmarkCheck, ListPlus, Eye, Lock, Reply, Loader2, Copy, Pencil, Trash2, X, Lightbulb, LayoutGrid, List } from "lucide-react";
import BackButton from "@/components/BackButton";
import MovieListItem from "@/components/MovieListItem";
import ShowListItem from "@/components/ShowListItem";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import CommentSection from "@/components/CommentSection";

interface CollectionItem {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  sortOrder: number;
  blurb: string | null;
  curatorRating: number | null;
  predictedRating: number | null;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  mediaType: string;
  coverPath: string | null;
  saveCount: number;
  viewCount: number;
  publishedAt: string | null;
  tags: string[];
  items: CollectionItem[];
  curator: {
    id: string;
    name: string;
    firebaseUid: string;
    avatarUrl: string | null;
    isAdmin: boolean;
    bio: string | null;
  };
  isOwner: boolean;
  isSaved: boolean;
  isOfficial: boolean;
  numberedOrder: boolean;
  themePromptId: string | null;
  themePrompt: { id: string; title: string } | null;
  matchScore: number | null;
  watched: { watched: number; total: number } | null;
}

// Same color anchor as the card so the detail header reads consistently.
function matchClasses(score: number): string {
  if (score >= 85) return "bg-green-500/15 text-green-300 border-green-500/40";
  if (score >= 70) return "bg-lime-500/15 text-lime-300 border-lime-500/40";
  if (score >= 55) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  if (score >= 40) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  return "bg-red-500/15 text-red-300 border-red-500/40";
}

interface Props {
  // Server-rendered initial data so the page paints with content even
  // before client-side auth resolves. The client refetches on mount when
  // a Backstage Pass user is detected — that pulls in matchScore,
  // watched, isSaved, etc. that depend on the viewer.
  initialData: CollectionDetail;
  uid: string;
  slug: string;
}

export default function CollectionDetailClient({ initialData, uid, slug }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { hasPass } = useSubscription();

  const [collection, setCollection] = useState<CollectionDetail | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wlMessage, setWlMessage] = useState<{ text: string; href?: string; linkLabel?: string; type: "success" | "error" } | null>(null);
  // View mode is sticky per user (localStorage). Defaults to grid since
  // most users browse visually. List view shines on long ordered sagas.
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("collections-view-mode");
    if (stored === "grid" || stored === "list") setViewMode(stored);
  }, []);
  function toggleViewMode(next: "grid" | "list") {
    setViewMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem("collections-view-mode", next);
  }

  // Refetch on the client when there's an authenticated user — the API
  // enriches the response with viewer-specific fields (isOwner, isSaved,
  // and for Backstage users matchScore/watched/predictedRating) that the
  // server-side initial render can't compute. Anonymous viewers stay on
  // the initial render only.
  const load = useCallback(async () => {
    if (!user) return;
    void hasPass;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/community-collections/${uid}/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) { setError("This collection isn't public or doesn't exist."); return; }
      if (!res.ok) return; // initial data is already shown; silent fail on enrich
      const data = await res.json();
      setCollection(data.collection);
    } catch { /* keep initial data on transient error */ }
  }, [user, uid, slug, hasPass]);

  useEffect(() => { load(); }, [load]);

  async function toggleSave() {
    if (!collection || saving) return;
    // Pre-check tier so users hit a clear paywall message instead of a
    // generic API error.
    if (!user) {
      setWlMessage({ text: "Sign in to bookmark collections.", type: "error", href: "/login", linkLabel: "Sign in" });
      return;
    }
    if (!hasPass) {
      setWlMessage({
        text: "Bookmarking collections is a Backstage Pass feature.",
        type: "error",
        href: "/backstage-pass/collections",
        linkLabel: "Learn more",
      });
      return;
    }
    setSaving(true);
    const wasSaved = collection.isSaved;
    // Optimistic update — revert on failure.
    setCollection({ ...collection, isSaved: !wasSaved, saveCount: collection.saveCount + (wasSaved ? -1 : 1) });
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${collection.id}/save`, {
        method: wasSaved ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setCollection({ ...collection, isSaved: wasSaved, saveCount: collection.saveCount });
      }
    } catch {
      setCollection({ ...collection, isSaved: wasSaved, saveCount: collection.saveCount });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user || !collection || deleting) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${collection.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) router.push(collection.isOfficial ? "/admin/collections" : "/tools/collections");
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleRemoveTheme() {
    if (!user || !collection || !collection.themePromptId) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/custom-collections/${collection.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ themePromptId: null }),
    });
    if (res.ok) {
      setCollection({ ...collection, themePromptId: null, themePrompt: null });
    }
  }

  // Saves a private copy of this collection to the viewer's personal
  // collections — different from Bookmark (which only adds to bookmarks
  // and doesn't duplicate items). Tags + theme don't carry over since
  // those are author-specific signals.
  async function copyToMyCollections() {
    if (!collection || copying) return;
    // Pre-check tier so users see a paywall message instead of "Failed
    // to copy collection" when the API 401/403s their request.
    if (!user) {
      setWlMessage({ text: "Sign in to save this collection.", type: "error", href: "/login", linkLabel: "Sign in" });
      return;
    }
    if (!hasPass) {
      setWlMessage({
        text: "Saving as a personal collection is a Backstage Pass feature.",
        type: "error",
        href: "/backstage-pass/collections",
        linkLabel: "Learn more",
      });
      return;
    }
    setCopying(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/custom-collections", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${collection.name} (copy)`.slice(0, 80),
          description: collection.description ?? null,
          prompt: "",
          mediaType: collection.mediaType,
          items: collection.items.map((i) => ({
            mediaType: i.mediaType,
            tmdbId: i.tmdbId,
            title: i.title,
            posterPath: i.posterPath,
            releaseDate: i.releaseDate,
            voteAverage: i.voteAverage,
          })),
        }),
      });
      if (!res.ok) {
        setWlMessage({ text: "Failed to copy collection.", type: "error" });
        return;
      }
      const data = await res.json();
      const newId: string | undefined = data.collection?.id;
      if (!newId) { setWlMessage({ text: "Failed to copy collection.", type: "error" }); return; }
      router.push(`/tools/collections/custom/${newId}`);
    } catch {
      setWlMessage({ text: "Failed to copy collection.", type: "error" });
    } finally {
      setCopying(false);
    }
  }

  async function createWatchlistFromCollection() {
    if (!user || !collection || creatingWatchlist) return;
    const name = window.prompt("Name for the watchlist:", collection.name);
    if (!name?.trim()) return;
    setCreatingWatchlist(true);
    setWlMessage(null);
    try {
      const token = await user.getIdToken();
      const createRes = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!createRes.ok) { setWlMessage({ text: "Failed to create watchlist.", type: "error" }); return; }
      const created = await createRes.json();
      const wlId: string | undefined = created.watchlist?.id ?? created.id;
      if (!wlId) { setWlMessage({ text: "Failed to create watchlist.", type: "error" }); return; }

      // Pass an explicit sortOrder per item so the watchlist preserves
      // the source collection's order, regardless of the user's
      // watchlistAddPosition preference. Watchlist is freshly created
      // here so 0..N is safe.
      const results = await Promise.allSettled(
        collection.items.map((item, idx) =>
          fetch(`/api/watchlist/${wlId}/movies`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdbId: item.tmdbId,
              title: item.title,
              posterPath: item.posterPath,
              releaseDate: item.releaseDate,
              mediaType: item.mediaType,
              sortOrder: idx,
            }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      const added = collection.items.length - failed;
      setWlMessage({
        text: `Watchlist "${name}" created with ${added}/${collection.items.length} title${collection.items.length === 1 ? "" : "s"}.`,
        href: `/watchlist?list=${wlId}`,
        type: "success",
      });
    } catch {
      setWlMessage({ text: "Failed to create watchlist.", type: "error" });
    } finally {
      setCreatingWatchlist(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <Lock className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3" />
        <p className="text-white text-lg mb-2">{error}</p>
        <Link href="/tools/collections" className="text-sm text-[var(--ratist-red)] hover:underline">Back to collections</Link>
      </div>
    );
  }
  if (!collection) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton
        fallback="/tools/collections"
        label="Back to collections"
        className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white mb-4"
      />

      {/* Curator header — Official curations swap the admin user's name +
          avatar for the Ratist mark so the attribution reads as the brand
          rather than an individual employee. */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <div className="flex items-start gap-4">
          {collection.isOfficial ? (
            <div className="w-12 h-12 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white text-lg font-bold shrink-0">
              ✦
            </div>
          ) : (
            <Link href={`/profile/${collection.curator.firebaseUid}`} className="shrink-0">
              {collection.curator.avatarUrl ? (
                <Image src={collection.curator.avatarUrl} alt={collection.curator.name} width={48} height={48} className="rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-base text-[var(--foreground-muted)]">
                  {collection.curator.name.charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{collection.name}</h1>
            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] mt-1">
              {collection.isOfficial ? (
                <span className="text-[var(--ratist-red)] font-semibold tracking-wide">Curated by The Ratist</span>
              ) : (
                <>
                  <span>by</span>
                  <Link href={`/profile/${collection.curator.firebaseUid}`} className="text-white hover:text-[var(--ratist-red)] transition-colors">
                    {collection.curator.name}
                  </Link>
                </>
              )}
              {collection.publishedAt && (
                <>
                  <span>•</span>
                  <span>{new Date(collection.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                </>
              )}
            </div>
            {collection.description && (
              <p className="text-sm text-white/85 mt-3 whitespace-pre-wrap">{collection.description}</p>
            )}
            {collection.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {collection.tags.map((tag) => (
                  <Link key={tag} href={`/tools/collections?tab=community&tag=${encodeURIComponent(tag)}`} className="text-[10px] uppercase tracking-wider bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white px-2 py-0.5 rounded transition-colors">
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] flex-wrap">
            {/* Hide the predicted-match badge from a personal-collection
                curator — they already know what's on their own list.
                Admin viewing an official Ratist collection still sees it
                because those are conceptually Ratist-authored. */}
            {(!collection.isOwner || collection.isOfficial) && typeof collection.matchScore === "number" && (
              <span
                className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${matchClasses(collection.matchScore)}`}
                title="Predicted match for your taste"
              >
                {collection.matchScore}% match
              </span>
            )}
            {collection.watched && collection.watched.watched > 0 && (
              <span className="flex items-center gap-1 text-green-400" title="Items you've already seen">
                <Eye className="w-3.5 h-3.5" /> {collection.watched.watched}/{collection.watched.total} watched
              </span>
            )}
            <span className="flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5" /> {collection.saveCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {collection.viewCount.toLocaleString()}
            </span>
            <span>{collection.items.length} title{collection.items.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Owner controls only for personal collections. Official
                Ratist collections are managed exclusively from the admin
                panel — even an admin viewing the public page should see
                the same UI a regular user does. */}
            {collection.isOwner && !collection.isOfficial ? (
              <>
                <Link
                  href={`/tools/collections/custom/${collection.id}/edit`}
                  className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-4 py-1.5 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Link>
                {confirmingDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    <button onClick={handleDelete} disabled={deleting} className="text-red-400 hover:text-red-300 font-medium">
                      {deleting ? "Deleting…" : "Confirm"}
                    </button>
                    <button onClick={() => setConfirmingDelete(false)} className="text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    title="Delete this collection"
                    className="p-1.5 rounded-full text-[var(--foreground-muted)] hover:text-red-400 border border-[var(--border)] hover:border-red-400/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              // Two save actions on someone else's collection:
              //   - Save as my collection: copies items into a new private
              //     personal collection so you can edit and curate.
              //   - Bookmark: adds to your bookmarks list (engagement
              //     signal, doesn't duplicate items).
              // Save-as-my-collection is the primary action.
              <>
                <button
                  onClick={copyToMyCollections}
                  disabled={copying}
                  title="Copy this collection's items into a new private collection of your own"
                  className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  {copying ? "Copying…" : "Save as my collection"}
                </button>
                <button
                  onClick={toggleSave}
                  disabled={saving}
                  title={collection.isSaved ? "Bookmarked — click to remove" : "Bookmark to find this collection later (doesn't copy items)"}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 ${
                    collection.isSaved
                      ? "bg-[var(--ratist-red)] text-white hover:bg-[var(--ratist-red-hover)]"
                      : "bg-[var(--surface-2)] text-white border border-[var(--border)] hover:border-[var(--ratist-red)]"
                  }`}
                >
                  {collection.isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                  {collection.isSaved ? "Bookmarked" : "Bookmark"}
                </button>
              </>
            )}
            <button
              onClick={createWatchlistFromCollection}
              disabled={creatingWatchlist}
              className="flex items-center gap-1.5 text-xs text-white bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <ListPlus className="w-3.5 h-3.5" />
              {creatingWatchlist ? "Creating…" : "Save as watchlist"}
            </button>
          </div>
        </div>

        {/* Theme association — personal-collection owners get an inline X
            to untag. Official Ratist collections route theme changes
            through the admin panel only. */}
        {collection.themePrompt && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)] text-xs">
            <Lightbulb className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
            <span className="text-[var(--foreground-muted)]">Responding to theme:</span>
            <span className="text-white font-medium">{collection.themePrompt.title}</span>
            {collection.isOwner && !collection.isOfficial && (
              <button
                onClick={handleRemoveTheme}
                title="Remove from theme"
                className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {wlMessage && (
          <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            wlMessage.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"
          }`}>
            <span className="flex-1">{wlMessage.text}</span>
            {wlMessage.href && <Link href={wlMessage.href} className="text-white underline hover:no-underline">{wlMessage.linkLabel ?? "View"}</Link>}
            <button onClick={() => setWlMessage(null)} className="text-[var(--foreground-muted)] hover:text-white">✕</button>
          </div>
        )}
      </div>

      {/* View toggle — sticky per user via localStorage. List mode is
          the right default for sagas with watch orders; grid is the
          general browse. */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <button
          onClick={() => toggleViewMode("grid")}
          title="Grid view"
          className={`p-1.5 rounded transition-colors ${
            viewMode === "grid"
              ? "bg-[var(--surface-2)] text-white"
              : "text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleViewMode("list")}
          title="List view"
          className={`p-1.5 rounded transition-colors ${
            viewMode === "list"
              ? "bg-[var(--surface-2)] text-white"
              : "text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* Items — grid or list. Numbered badge renders in both modes when
          the curator opted in. */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
          {collection.items.map((item, idx) => (
            <div key={item.id} className="space-y-2 relative">
              {collection.numberedOrder && (
                <span className="absolute top-1.5 left-1.5 z-10 pointer-events-none flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-[var(--ratist-red)] text-white text-[11px] font-bold rounded-full shadow-md">
                  {idx + 1}
                </span>
              )}
              {item.mediaType === "tv" ? (
                <ShowCard
                  show={{
                    id: item.tmdbId,
                    name: item.title,
                    overview: "",
                    poster_path: item.posterPath,
                    backdrop_path: null,
                    first_air_date: item.releaseDate ?? "",
                    popularity: 0,
                    vote_average: item.voteAverage ?? 0,
                    vote_count: 0,
                  }}
                />
              ) : (
                <MovieCard
                  movie={{
                    id: item.tmdbId,
                    title: item.title,
                    overview: "",
                    poster_path: item.posterPath,
                    backdrop_path: null,
                    release_date: item.releaseDate ?? "",
                    popularity: 0,
                    vote_average: item.voteAverage ?? 0,
                    vote_count: 0,
                  }}
                />
              )}
              {(!collection.isOwner || collection.isOfficial) && (item.curatorRating != null || item.predictedRating != null) && (
                <div className="flex items-center justify-between gap-2 px-1 text-[10px]">
                  {item.curatorRating != null ? (
                    <span className="text-[var(--foreground-muted)]" title={`${collection.curator.name}'s rating`}>
                      Curator <span className="text-white font-semibold">{item.curatorRating.toFixed(1)}</span>
                    </span>
                  ) : <span />}
                  {item.predictedRating != null && (
                    <span className="text-[var(--ratist-red)]" title="Your predicted rating">
                      You <span className="font-semibold">{item.predictedRating.toFixed(1)}</span>
                    </span>
                  )}
                </div>
              )}
              {item.blurb && (
                <p className="text-[11px] text-[var(--foreground-muted)] italic px-1 leading-snug">{item.blurb}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {collection.items.map((item, idx) => (
            <div key={item.id} className="flex items-start gap-3">
              {collection.numberedOrder && (
                <span className="shrink-0 w-7 text-right pt-2 text-sm font-bold text-[var(--ratist-red)] tabular-nums">
                  {idx + 1}
                </span>
              )}
              <div className="flex-1 min-w-0">
                {item.mediaType === "tv" ? (
                  <ShowListItem
                    show={{
                      id: item.tmdbId,
                      name: item.title,
                      overview: "",
                      poster_path: item.posterPath,
                      backdrop_path: null,
                      first_air_date: item.releaseDate ?? "",
                      popularity: 0,
                      vote_average: item.voteAverage ?? 0,
                      vote_count: 0,
                    }}
                  />
                ) : (
                  <MovieListItem
                    movie={{
                      id: item.tmdbId,
                      title: item.title,
                      overview: "",
                      poster_path: item.posterPath,
                      backdrop_path: null,
                      release_date: item.releaseDate ?? "",
                      popularity: 0,
                      vote_average: item.voteAverage ?? 0,
                      vote_count: 0,
                    }}
                  />
                )}
                {(!collection.isOwner || collection.isOfficial) && (item.curatorRating != null || item.predictedRating != null) && (
                  <div className="flex items-center gap-3 px-1 mt-1 text-[10px]">
                    {item.curatorRating != null && (
                      <span className="text-[var(--foreground-muted)]" title={`${collection.curator.name}'s rating`}>
                        Curator <span className="text-white font-semibold">{item.curatorRating.toFixed(1)}</span>
                      </span>
                    )}
                    {item.predictedRating != null && (
                      <span className="text-[var(--ratist-red)]" title="Your predicted rating">
                        You <span className="font-semibold">{item.predictedRating.toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                )}
                {item.blurb && (
                  <p className="text-[11px] text-[var(--foreground-muted)] italic px-1 mt-1 leading-snug">{item.blurb}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comments + reply with your own list */}
      <div className="border-t border-[var(--border)] pt-6">
        <div className="flex items-center gap-2 mb-3">
          <Reply className="w-4 h-4 text-[var(--ratist-red)]" />
          <h2 className="text-base font-semibold text-white">Discussion</h2>
        </div>
        <CommentSection
          targetType="collection"
          targetId={collection.id}
          enableCollectionLink
        />
      </div>

    </div>
  );
}
