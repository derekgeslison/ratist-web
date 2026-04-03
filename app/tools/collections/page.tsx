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

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/tools/collections", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections ?? []);
        // Default collapsed
      }
      setLoading(false);
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
    const token = await getToken();
    if (!token) return;
    setAddingToWatchlist(movie.id);
    await fetch(`/api/movies/${movie.tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    setAddingToWatchlist(null);
  }

  async function createWatchlistFromCollection(collection: Collection) {
    const name = prompt("Name for the watchlist:", collection.title);
    if (!name?.trim()) return;
    setCreatingWatchlist(collection.key);
    const token = await getToken();
    if (!token) return;

    // Create the watchlist
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) { setCreatingWatchlist(null); return; }
    const data = await res.json();
    const wlId = data.watchlist?.id ?? data.id;
    if (!wlId) { setCreatingWatchlist(null); return; }

    // Add all movies to it
    for (const movie of collection.movies) {
      await fetch(`/api/watchlist/${wlId}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: movie.tmdbId, title: movie.title, posterPath: movie.posterPath, releaseDate: movie.releaseDate }),
      });
    }

    setCreatingWatchlist(null);
    alert(`Watchlist "${name}" created with ${collection.movies.length} movies!`);
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
