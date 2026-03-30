"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";

interface WatchlistMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  voteAverage: number | null;
  ratistRating: number | null;
  addedAt: string;
}

export default function WatchlistPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<WatchlistMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setMovies(data.movies ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  const filtered = query
    ? movies.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
    : movies;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Bookmark className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">My Watchlist</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-1">Movies you want to watch.</p>
      <Link href="/seen" className="text-sm text-[var(--ratist-red)] hover:underline mb-6 inline-block">
        View movies you&apos;ve already seen →
      </Link>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your watchlist.
        </div>
      ) : (
        <>
          {movies.length > 0 && (
            <div className="flex gap-6 mb-6 text-sm">
              <div>
                <p className="text-xl font-bold text-white">{movies.length}</p>
                <p className="text-[var(--foreground-muted)] text-xs">To watch</p>
              </div>
            </div>
          )}

          {movies.length > 5 && (
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your watchlist..."
                className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
            </div>
          )}

          {loading ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-[var(--foreground-muted)]">
              {movies.length === 0 ? (
                <>
                  <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="mb-2">Your watchlist is empty.</p>
                  <p className="text-sm">Click the bookmark icon on any movie to add it here.</p>
                  <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
                </>
              ) : (
                <p>No movies match &quot;{query}&quot;</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {filtered.map((movie) => (
                <Link key={movie.id} href={`/movies/${movie.tmdbId}`} className="group flex flex-col">
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-1.5">
                    {movie.posterPath ? (
                      <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="120px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                    )}
                    </div>
                  <p className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{movie.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {movie.voteAverage != null && movie.voteAverage > 0 && (
                      <RatingBadge type="community" score={movie.voteAverage} size="sm" />
                    )}
                    {movie.ratistRating != null && (
                      <RatingBadge type="ratist" score={movie.ratistRating} size="sm" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
