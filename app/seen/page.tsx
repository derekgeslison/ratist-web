"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Star, Search, Calendar, ArrowUpDown } from "lucide-react";
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
  watchedDate: string;
}

export default function SeenPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<SeenMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState<"date" | "title" | "year" | "rating">("date");
  const [editingDate, setEditingDate] = useState<string | null>(null);

  async function updateWatchedDate(tmdbId: number, date: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ watchedDate: date }),
    });
    setMovies((prev) =>
      prev.map((m) => (m.tmdbId === tmdbId ? { ...m, watchedDate: date } : m))
    );
    setEditingDate(null);
  }

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/seen", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setMovies(data.movies ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  const filtered = [...movies
    .filter((m) => !query || m.title.toLowerCase().includes(query.toLowerCase()))
    .filter((m) => !yearFilter || new Date(m.watchedDate ?? m.seenAt).getFullYear().toString() === yearFilter)
  ].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "year") return (b.year || "0").localeCompare(a.year || "0");
    if (sort === "rating") return (b.ratistRating ?? -1) - (a.ratistRating ?? -1);
    // date: sort by watchedDate descending
    return new Date(b.watchedDate ?? b.seenAt).getTime() - new Date(a.watchedDate ?? a.seenAt).getTime();
  });

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

          {movies.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your seen list..."
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                <button
                  onClick={() => setYearFilter("")}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${!yearFilter ? "bg-[var(--ratist-red)]/20 text-white border border-[var(--ratist-red)]/50" : "text-[var(--foreground-muted)] hover:text-white border border-transparent"}`}
                >
                  All time
                </button>
                <input
                  type="number"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  placeholder="Year…"
                  min={1900} max={2099}
                  className="w-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                {(["date", "title", "year", "rating"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSort(s)}
                    className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors capitalize ${sort === s ? "bg-[var(--ratist-red)]/20 text-white border border-[var(--ratist-red)]/50" : "text-[var(--foreground-muted)] hover:text-white border border-transparent"}`}
                  >
                    {s === "date" ? "Date Watched" : s === "rating" ? "My Rating" : s === "year" ? "Release Year" : "Title"}
                  </button>
                ))}
              </div>
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
              {filtered.map((movie) => {
                const dateStr = movie.watchedDate
                  ? new Date(movie.watchedDate).toISOString().slice(0, 10)
                  : new Date(movie.seenAt).toISOString().slice(0, 10);
                const isEditing = editingDate === movie.id;
                return (
                  <div key={movie.id} className="group flex flex-col">
                    <Link href={`/movies/${movie.tmdbId}`} className="block">
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
                    </Link>
                    <Link href={`/movies/${movie.tmdbId}`} className="text-xs font-medium text-white line-clamp-1 group-hover:text-[var(--ratist-red)] transition-colors">{movie.title}</Link>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
                      {movie.ratistRating && (
                        <p className="text-xs font-semibold" style={{ color: scoreColor(movie.ratistRating) }}>{movie.ratistRating.toFixed(1)}</p>
                      )}
                    </div>
                    {/* Watched date */}
                    {isEditing ? (
                      <input
                        type="date"
                        defaultValue={dateStr}
                        max={new Date().toISOString().slice(0, 10)}
                        autoFocus
                        onBlur={(e) => updateWatchedDate(movie.tmdbId, e.target.value)}
                        onChange={(e) => { if (e.target.value) updateWatchedDate(movie.tmdbId, e.target.value); }}
                        className="mt-0.5 w-full bg-[var(--surface)] border border-[var(--ratist-red)] text-white text-[10px] rounded px-1 py-0.5 focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingDate(movie.id)}
                        className="flex items-center gap-0.5 mt-0.5 text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors"
                        title="Change watched date"
                      >
                        <Calendar className="w-2.5 h-2.5 shrink-0" />
                        {new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
