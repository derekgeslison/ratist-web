"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Sparkles, Pencil, ListPlus, Check, Lock, Trash2, Lightbulb, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import CommentSection from "@/components/CommentSection";
import BackButton from "@/components/BackButton";

interface Item {
  id: string;
  mediaType: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  blurb: string | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  mediaType: string;
  visibility: string;
  slug: string | null;
  publishedAt: string | null;
  isOfficial: boolean;
  saveCount: number;
  viewCount: number;
  createdAt: string;
  themePromptId: string | null;
  themePrompt: { id: string; title: string } | null;
  items: Item[];
}

export default function CustomCollectionPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingWl, setCreatingWl] = useState(false);
  const [wlMessage, setWlMessage] = useState<{ type: "success" | "error"; text: string; href?: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    }
  }

  // Untag the collection from its current theme. Doesn't unpublish or
  // change anything else — just clears the themePromptId field.
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError("Collection not found."); setLoading(false); return; }
      const data = await res.json();
      const c = data.collection;
      // If the collection is published, the canonical view is the public
      // URL. Redirect there so owner + non-owner share a single page —
      // owner controls live on the public detail page now.
      if (c?.visibility === "public" && c?.slug) {
        router.replace(`/collections/${user.uid}/${c.slug}`);
        return;
      }
      setCollection(c);
      setLoading(false);
    })();
  }, [user, id, router]);

  async function handleCreateWatchlist() {
    if (!user || !collection || creatingWl) return;
    const name = window.prompt("Name for the watchlist:", collection.name);
    if (!name?.trim()) return;
    setCreatingWl(true);
    setWlMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) { setWlMessage({ type: "error", text: "Failed to create watchlist." }); return; }
      const data = await res.json();
      const wlId: string | undefined = data.watchlist?.id ?? data.id;
      if (!wlId) { setWlMessage({ type: "error", text: "Failed to create watchlist." }); return; }

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
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      const added = collection.items.length - failed;
      setWlMessage({
        type: "success",
        text: `Watchlist "${name}" created with ${added}/${collection.items.length} title${collection.items.length === 1 ? "" : "s"}.`,
        href: `/watchlist?list=${wlId}`,
      });
    } catch {
      setWlMessage({ type: "error", text: "Failed to create watchlist." });
    } finally {
      setCreatingWl(false);
    }
  }

  if (loading) return <p className="max-w-5xl mx-auto px-4 py-8 text-[var(--foreground-muted)]">Loading…</p>;
  if (error || !collection) return <p className="max-w-5xl mx-auto px-4 py-8 text-red-400">{error || "Not found"}</p>;

  const isPublic = collection.visibility === "public" && !!collection.slug;
  const isAi = !!collection.prompt && collection.prompt.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton
        fallback={collection.isOfficial ? "/admin/collections" : "/tools/collections"}
        label={collection.isOfficial ? "Ratist collections" : "Collections"}
      />


      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isAi && (
              <div className="flex items-center gap-1 text-[var(--ratist-red)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">AI</span>
              </div>
            )}
            <span className={`text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 ${
              isPublic
                ? "bg-green-500/15 text-green-300 border-green-500/40"
                : "bg-[var(--surface-2)] text-[var(--foreground-muted)] border-[var(--border)]"
            }`}>
              {isPublic ? "Public" : "Private"}
            </span>
            {collection.isOfficial && (
              <span className="text-[10px] font-semibold tracking-wider text-[var(--ratist-red)]">✦ Curated by The Ratist</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
          {collection.description && (
            <p className="text-sm text-[var(--foreground-muted)] mt-1">{collection.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCreateWatchlist}
            disabled={creatingWl || collection.items.length === 0}
            className="flex items-center gap-1.5 text-xs text-white bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <ListPlus className="w-3.5 h-3.5" />
            {creatingWl ? "Creating…" : "Save as watchlist"}
          </button>
          <Link
            href={`/tools/collections/custom/${collection.id}/edit`}
            className="flex items-center gap-1.5 text-xs text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-3 py-1.5 transition-colors"
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
              title="Delete collection"
              className="p-1.5 rounded-full text-[var(--foreground-muted)] hover:text-red-400 border border-[var(--border)] hover:border-red-400/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Engagement counts/public page link were here when the owner view
          rendered both private and public collections. Public collections
          now redirect to /collections/[uid]/[slug] in the load effect, so
          this surface is private-only and those counts aren't needed. */}

      {isAi && (
        <p className="text-xs text-[var(--foreground-muted)] italic mt-3 mb-4">
          Generated from: &ldquo;{collection.prompt}&rdquo;
        </p>
      )}

      {/* Theme link — when this collection is tagged to an active prompt,
          show the link with an inline X to untag without leaving the page. */}
      {collection.themePrompt && (
        <div className="flex items-center gap-2 mt-3 mb-4 text-xs">
          <Lightbulb className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
          <span className="text-[var(--foreground-muted)]">Responding to theme:</span>
          <span className="text-white font-medium">{collection.themePrompt.title}</span>
          <button
            onClick={handleRemoveTheme}
            title="Remove from theme"
            className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {wlMessage && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 mb-4 text-sm ${
          wlMessage.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"
        }`}>
          {wlMessage.type === "success" && <Check className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{wlMessage.text}</span>
          {wlMessage.href && (
            <Link href={wlMessage.href} className="text-white underline hover:no-underline">View watchlist →</Link>
          )}
        </div>
      )}

      {collection.items.length === 0 ? (
        <p className="text-center py-16 text-[var(--foreground-muted)]">No items in this collection.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          {collection.items.map((item) => (
            <div key={item.id} className="space-y-2">
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
              {item.blurb && (
                <p className="text-[11px] text-[var(--foreground-muted)] italic px-1 leading-snug">{item.blurb}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comments — only meaningful on published collections (community
          feature is paid-only and private collections aren't reachable). */}
      {isPublic ? (
        <div className="border-t border-[var(--border)] pt-6">
          <h2 className="text-base font-semibold text-white mb-3">Discussion</h2>
          <CommentSection
            targetType="collection"
            targetId={collection.id}
            enableCollectionLink
          />
        </div>
      ) : (
        <div className="border-t border-[var(--border)] pt-6 text-xs text-[var(--foreground-muted)] flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          <span>Comments will appear here once you publish this collection to the community.</span>
        </div>
      )}
    </div>
  );
}
