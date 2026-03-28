"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Star, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";

interface SeenMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  ratistRating: number | null;
  seenAt: string;
}

export default function SeenPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<SeenMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/seen", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setMovies(data.movies ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  const filtered = query
    ? movies.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
    : movies;

  const rated = movies.filter((m) => m.ratistRating !== null).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Eye className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Movies I&apos;ve Seen</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-1">Everything you&apos;ve marked as seen.</p>
      <Link href="/watchlist" className="text-sm text-[var(--ratist-red)] hover:underline mb-6 inline-block">
        View your want-to-watch list →
      </Link>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your film diary.
        </div>
      ) : (
        <>
          {movies.length > 0 && (
            <div className="flex gap-6 mb-6 text-sm">
              <div>
                <p className="text-xl font-bold text-white">{movies.length}</p>
                <p className="text-[var(--foreground-muted)] text-xs">Movies seen</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white">{rated}</p>
                <p className="text-[var(--foreground-muted)] text-xs">Rated</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white">{movies.length - rated}</p>
                <p className="text-[var(--foreground-muted)] text-xs">Not yet rated</p>
              </div>
            </div>
          )}

          {movies.length > 5 && (
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your seen list..."
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
                  <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="mb-2">Nothing here yet.</p>
                  <p className="text-sm">Click &ldquo;Mark Seen&rdquo; on any movie to track what you&apos;ve watched.</p>
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
                    {movie.ratistRating === null && (
                      <div className="absolute bottom-1 right-1">
                        <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" /> Rate
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{movie.title}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
                    {movie.ratistRating && (
                      <p className="text-xs font-semibold" style={{ color: scoreColor(movie.ratistRating) }}>{movie.ratistRating.toFixed(1)}</p>
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
