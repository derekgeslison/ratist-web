"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2, ListPlus, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";

interface Item {
  id: string;
  mediaType: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  mediaType: string;
  createdAt: string;
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError("Collection not found."); setLoading(false); return; }
      const data = await res.json();
      setCollection(data.collection);
      setLoading(false);
    })();
  }, [user, id]);

  async function handleDelete() {
    if (!user || !collection) return;
    if (!confirm(`Delete "${collection.name}"?`)) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/custom-collections/${collection.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) router.push("/tools/collections");
  }

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
        collection.items.map((item) =>
          fetch(`/api/watchlist/${wlId}/movies`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdbId: item.tmdbId,
              title: item.title,
              posterPath: item.posterPath,
              releaseDate: item.releaseDate,
              mediaType: item.mediaType,
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/tools/collections" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Collections
      </Link>

      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 text-[var(--ratist-red)] mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">AI collection</span>
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
            className="flex items-center gap-1.5 text-xs text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <ListPlus className="w-3.5 h-3.5" />
            {creatingWl ? "Creating…" : "Create watchlist"}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-red-400 border border-[var(--border)] hover:border-red-400/50 rounded-full px-3 py-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--foreground-muted)] italic mb-6">
        Generated from: &ldquo;{collection.prompt}&rdquo;
      </p>

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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {collection.items.map((item) => (
            item.mediaType === "tv" ? (
              <ShowCard
                key={item.id}
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
                key={item.id}
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
            )
          ))}
        </div>
      )}
    </div>
  );
}
