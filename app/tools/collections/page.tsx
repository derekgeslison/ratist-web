"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, BookmarkPlus, ListPlus, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface CollectionMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  communityRating: number | null;
}

interface Collection {
  key: string;
  title: string;
  description: string;
  emoji: string;
  movies: CollectionMovie[];
}

export default function CollectionsPage() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingToWatchlist, setAddingToWatchlist] = useState<string | null>(null);
  const [creatingWatchlist, setCreatingWatchlist] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/tools/collections", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { setError("Failed to load collections."); setLoading(false); return; }
        const data = await res.json();
        setCollections(data.collections ?? []);
      } catch {
        setError("Failed to load collections.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, getToken]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function addToDefaultWatchlist(movie: CollectionMovie) {
    try {
      const token = await getToken();
      if (!token) return;
      setAddingToWatchlist(movie.id);
      const res = await fetch(`/api/movies/${movie.tmdbId}/watchlist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) setError("Failed to add to watchlist.");
    } catch {
      setError("Failed to add to watchlist.");
    } finally {
      setAddingToWatchlist(null);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function createWatchlistFromCollection(collection: Collection) {
    const name = prompt("Name for the watchlist:", collection.title);
    if (!name?.trim()) return;
    setCreatingWatchlist(collection.key);
    try {
      const token = await getToken();
      if (!token) return;

      // Create the watchlist
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) { setError("Failed to create watchlist."); return; }
      const data = await res.json();
      const wlId = data.watchlist?.id ?? data.id;
      if (!wlId) { setError("Failed to create watchlist."); return; }

      // Add all movies in parallel
      const results = await Promise.allSettled(
        collection.movies.map((movie) =>
          fetch(`/api/watchlist/${wlId}/movies`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ tmdbId: movie.tmdbId, title: movie.title, posterPath: movie.posterPath, releaseDate: movie.releaseDate }),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        showSuccess(`Watchlist "${name}" created — ${collection.movies.length - failed}/${collection.movies.length} movies added.`);
      } else {
        showSuccess(`Watchlist "${name}" created with ${collection.movies.length} movies!`);
      }
    } catch {
      setError("Failed to create watchlist.");
    } finally {
      setCreatingWatchlist(null);
    }
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">
        <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your personalized collections.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Collections</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Personalized movie recommendations based on your taste, ratings, and watch history.</p>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-3">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-900/40 border border-green-700 text-green-200 text-sm rounded-lg px-4 py-2.5 mb-4">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Generating your collections...</p>
      ) : collections.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-[var(--foreground-muted)] mb-2">Not enough data to generate collections yet.</p>
          <p className="text-sm text-[var(--foreground-muted)]">Rate more movies to unlock personalized recommendations.</p>
          <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline mt-4 inline-block">Browse movies →</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {collections.map((collection) => {
            const isExpanded = expanded.has(collection.key);
            const displayMovies = isExpanded ? collection.movies : collection.movies.slice(0, 6);
            return (
              <section key={collection.key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{collection.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-white">{collection.title}</h2>
                      <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{collection.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => createWatchlistFromCollection(collection)}
                      disabled={creatingWatchlist === collection.key}
                      className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-white bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 transition-colors"
                      title="Create watchlist from this collection"
                    >
                      <ListPlus className="w-3 h-3" />
                      {creatingWatchlist === collection.key ? "Creating..." : "Save as Watchlist"}
                    </button>
                    <span className="text-xs text-[var(--foreground-muted)]">{collection.movies.length} films</span>
                  </div>
                </div>

                {/* Movie grid */}
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {displayMovies.map((movie) => (
                      <div key={movie.id} className="group relative">
                        <Link href={`/movies/${movie.tmdbId}`}>
                          <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)]">
                            {movie.posterPath ? (
                              <Image src={posterUrl(movie.posterPath, "w342")} alt={movie.title} fill sizes="150px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)] p-2 text-center">{movie.title}</div>
                            )}
                            {movie.voteAverage != null && movie.voteAverage > 0 && movie.voteAverage < 10 && (
                              <div className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                ★ {movie.voteAverage.toFixed(1)}
                              </div>
                            )}
                          </div>
                        </Link>
                        <p className="text-[10px] text-white mt-1.5 truncate">{movie.title}</p>
                        <p className="text-[9px] text-[var(--foreground-muted)]">{movie.releaseDate?.slice(0, 4)}</p>

                        {/* Quick actions on hover */}
                        <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={(e) => { e.preventDefault(); addToDefaultWatchlist(movie); }}
                            disabled={addingToWatchlist === movie.id}
                            className="bg-black/70 text-white p-1 rounded hover:bg-[var(--ratist-red)] transition-colors"
                            title="Add to watchlist"
                          >
                            <BookmarkPlus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Expand/collapse */}
                  {collection.movies.length > 6 && (
                    <button onClick={() => toggleExpand(collection.key)}
                      className="flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline mt-3 mx-auto">
                      {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all {collection.movies.length}</>}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
