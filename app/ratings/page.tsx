"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Search, ArrowUpDown, Filter } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import { scoreColor } from "@/lib/ratings";

interface UserRating {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  genres: string[];
  directors: string[];
  actors: string[];
  voteAverage: number | null;
  ratistRating: number | null;
  overallRating: number | null;
  reviewText: string | null;
  reviewType: string;
  ratingStatus: "complete" | "incomplete" | "imported";
  watchedDate: string | null;
  ratedAt: string;
}

interface UnratedMovie {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  genres: string[];
  voteAverage: number | null;
  watchedDate: string | null;
  seenAt: string;
}

type TabMode = "rated" | "needs-rating";
type StatusFilter = "" | "complete" | "incomplete" | "imported";
type SortBy = "rated" | "score" | "title" | "year";

export default function RatingsPage() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<UserRating[]>([]);
  const [unrated, setUnrated] = useState<UnratedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [serverAvg, setServerAvg] = useState<number | null>(null);
  const [tab, setTab] = useState<TabMode>("rated");
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [decadeFilter, setDecadeFilter] = useState("");
  const [directorFilter, setDirectorFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [ratingRange, setRatingRange] = useState<"" | "8+" | "6+" | "4-">("");
  const [sort, setSort] = useState<SortBy>("rated");
  const [unratedSort, setUnratedSort] = useState<"recent" | "title" | "year">("recent");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    user.getIdToken().then((token) => {
      fetch("/api/ratings", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setRatings(data.ratings ?? []);
          setUnrated(data.unrated ?? []);
          setNextCursor(data.nextCursor ?? null);
          setHasMore(data.hasMore ?? false);
          setTotalCount(data.totalCount ?? 0);
          setServerAvg(data.avgRating ?? null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [user]);

  async function loadMore() {
    if (!user || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/ratings?cursor=${nextCursor}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setRatings((prev) => [...prev, ...(data.ratings ?? [])]);
    setNextCursor(data.nextCursor ?? null);
    setHasMore(data.hasMore ?? false);
    setLoadingMore(false);
  }

  async function loadAll() {
    if (!user || loadingMore) return;
    setLoadingMore(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/ratings?all=1", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setRatings(data.ratings ?? []);
    setNextCursor(null);
    setHasMore(false);
    setLoadingMore(false);
  }

  const availableGenres = useMemo(() => {
    const genres = new Set<string>();
    for (const r of ratings) r.genres.forEach((g) => genres.add(g));
    for (const u of unrated) u.genres.forEach((g) => genres.add(g));
    return [...genres].sort();
  }, [ratings, unrated]);

  const availableDecades = useMemo(() => {
    const decades = new Set<string>();
    for (const r of ratings) {
      if (r.year) decades.add(r.year.slice(0, 3) + "0s");
    }
    return [...decades].sort().reverse();
  }, [ratings]);

  const availableDirectors = useMemo(() => {
    const dirs = new Map<string, number>();
    for (const r of ratings) r.directors.forEach((d) => dirs.set(d, (dirs.get(d) ?? 0) + 1));
    return [...dirs.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [ratings]);

  const availableActors = useMemo(() => {
    const acts = new Map<string, number>();
    for (const r of ratings) r.actors.forEach((a) => acts.set(a, (acts.get(a) ?? 0) + 1));
    return [...acts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [ratings]);

  // Filtered/sorted unrated movies
  const filteredUnrated = useMemo(() => {
    let arr = unrated.filter((m) => {
      if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (genreFilter && !m.genres.includes(genreFilter)) return false;
      return true;
    });
    if (unratedSort === "title") arr = [...arr].sort((a, b) => a.title.localeCompare(b.title));
    else if (unratedSort === "year") arr = [...arr].sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
    else arr = [...arr].sort((a, b) => new Date(b.watchedDate ?? b.seenAt).getTime() - new Date(a.watchedDate ?? a.seenAt).getTime());
    return arr;
  }, [unrated, query, genreFilter, unratedSort]);

  const filtered = useMemo(() => {
    return ratings.filter((r) => {
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (genreFilter && !r.genres.includes(genreFilter)) return false;
      if (decadeFilter && !(r.year && r.year.slice(0, 3) + "0s" === decadeFilter)) return false;
      if (directorFilter && !r.directors.includes(directorFilter)) return false;
      if (actorFilter && !r.actors.includes(actorFilter)) return false;
      if (statusFilter === "complete" && r.ratingStatus !== "complete") return false;
      if (statusFilter === "incomplete" && r.ratingStatus !== "incomplete") return false;
      if (statusFilter === "imported" && r.ratingStatus !== "imported") return false;
      const score = r.ratistRating ?? r.overallRating;
      if (ratingRange === "8+" && (score == null || score < 8)) return false;
      if (ratingRange === "6+" && (score == null || score < 6)) return false;
      if (ratingRange === "4-" && (score == null || score >= 4)) return false;
      return true;
    });
  }, [ratings, query, genreFilter, decadeFilter, directorFilter, actorFilter, statusFilter, ratingRange]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "score") arr.sort((a, b) => ((b.ratistRating ?? b.overallRating ?? -1) - (a.ratistRating ?? a.overallRating ?? -1)));
    else if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "year") arr.sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
    else arr.sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime());
    return arr;
  }, [filtered, sort]);

  // Stats
  const complete = ratings.filter((r) => r.ratingStatus === "complete").length;
  const incomplete = ratings.filter((r) => r.ratingStatus === "incomplete").length;
  const imported = ratings.filter((r) => r.ratingStatus === "imported").length;
  const isFiltered = query || genreFilter || decadeFilter || directorFilter || actorFilter || statusFilter || ratingRange;
  const filteredWithScores = filtered.filter((r) => r.ratistRating != null);
  const filteredAvg = filteredWithScores.length > 0
    ? filteredWithScores.reduce((s, r) => s + r.ratistRating!, 0) / filteredWithScores.length
    : null;
  const avgScore = isFiltered ? filteredAvg : serverAvg;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Star className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">My Ratings</h1>
        </div>
        <Link href="/profile/import" className="text-sm text-[var(--ratist-red)] hover:underline">
          Import →
        </Link>
      </div>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your ratings.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading…</p>
      ) : ratings.length === 0 && unrated.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <Star className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-2">No ratings yet.</p>
          <div className="flex flex-col items-center gap-2">
            <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
            <Link href="/profile/import" className="text-sm text-[var(--foreground-muted)] hover:text-white hover:underline">Import from Letterboxd or IMDb →</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Tab toggle */}
          <div className="flex items-center gap-1 border-b border-[var(--border)] mb-4">
            <button
              onClick={() => setTab("rated")}
              className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${tab === "rated" ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"}`}
            >
              Rated
              <span className="ml-1.5 text-xs bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded-full">{ratings.length}</span>
            </button>
            <button
              onClick={() => setTab("needs-rating")}
              className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${tab === "needs-rating" ? "border-[var(--ratist-red)] text-white" : "border-transparent text-[var(--foreground-muted)] hover:text-white"}`}
            >
              Needs Rating
              {unrated.length > 0 && (
                <span className="ml-1.5 text-xs bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] px-1.5 py-0.5 rounded-full">{unrated.length}</span>
              )}
            </button>
          </div>

          {/* ── RATED TAB ── */}
          {tab === "rated" && (<>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
            <span><span className="text-white font-bold">{totalCount}</span> <span className="text-[var(--foreground-muted)]">total</span></span>
            <span><span className="text-white font-bold">{complete}</span> <span className="text-[var(--foreground-muted)]">complete</span></span>
            {incomplete > 0 && <span><span className="text-orange-400 font-bold">{incomplete}</span> <span className="text-[var(--foreground-muted)]">incomplete</span></span>}
            {imported > 0 && <span><span className="text-blue-400 font-bold">{imported}</span> <span className="text-[var(--foreground-muted)]">quick/imported</span></span>}
            {avgScore != null && (
              <span>
                <span className="text-[var(--foreground-muted)]">{isFiltered ? "filtered avg " : "avg "}</span>
                <span className="font-bold" style={{ color: scoreColor(avgScore) }}>{avgScore.toFixed(1)}</span>
                {isFiltered && filteredWithScores.length > 0 && (
                  <span className="text-[var(--foreground-muted)]"> ({filteredWithScores.length})</span>
                )}
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..."
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] w-40" />
            </div>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
              <option value="">All statuses</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete (draft)</option>
              <option value="imported">Quick / Imported</option>
            </select>

            <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
              <option value="">All genres</option>
              {availableGenres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            {availableDecades.length > 1 && (
              <select value={decadeFilter} onChange={(e) => setDecadeFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
                <option value="">All decades</option>
                {availableDecades.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            {availableDirectors.length > 0 && (
              <select value={directorFilter} onChange={(e) => setDirectorFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
                <option value="">All directors</option>
                {availableDirectors.filter((d) => d.count >= 2).map((d) => (
                  <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
                ))}
              </select>
            )}

            {availableActors.length > 0 && (
              <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
                <option value="">All actors</option>
                {availableActors.filter((a) => a.count >= 2).map((a) => (
                  <option key={a.name} value={a.name}>{a.name} ({a.count})</option>
                ))}
              </select>
            )}

            <select value={ratingRange} onChange={(e) => setRatingRange(e.target.value as typeof ratingRange)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
              <option value="">All scores</option>
              <option value="8+">8+ rated</option>
              <option value="6+">6+ rated</option>
              <option value="4-">Below 4</option>
            </select>

            {isFiltered && (
              <button
                onClick={() => { setQuery(""); setGenreFilter(""); setDecadeFilter(""); setDirectorFilter(""); setActorFilter(""); setStatusFilter(""); setRatingRange(""); }}
                className="text-xs text-[var(--ratist-red)] hover:underline"
              >
                Clear filters
              </button>
            )}

            <div className="flex items-center gap-1 text-xs">
              <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
              {(["rated", "score", "title", "year"] as SortBy[]).map((s) => (
                <button key={s} onClick={() => setSort(s)}
                  className={`px-2 py-1 rounded-md font-medium transition-colors ${sort === s ? "bg-[var(--ratist-red)]/20 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                  {s === "rated" ? "Recent" : s === "score" ? "Score" : s === "title" ? "Title" : "Year"}
                </button>
              ))}
            </div>
          </div>

          {/* Ratings list */}
          {sorted.length === 0 ? (
            <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No ratings match your filters.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]/10">
              {sorted.map((r) => {
                const score = r.ratistRating ?? r.overallRating;
                return (
                  <div key={r.id} className="flex items-center gap-3 py-3 group">
                    <Link href={`/movies/${r.tmdbId}`} className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                      {r.posterPath && (
                        <Image src={posterUrl(r.posterPath, "w92")} alt={r.title} fill sizes="40px" className="object-cover" />
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/movies/${r.tmdbId}`} className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                        {r.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                        <span>{r.year}</span>
                        {r.reviewText && <span className="line-clamp-1 italic">· {r.reviewText}</span>}
                      </div>
                    </div>

                    {/* Status + score */}
                    <div className="flex items-center gap-2 shrink-0">
                      {r.ratingStatus === "incomplete" ? (
                        <Link href={`/movies/${r.tmdbId}/rate`} className="text-xs font-semibold px-2 py-0.5 rounded-full border border-orange-400/50 text-orange-400 hover:bg-orange-400 hover:text-white transition-colors">
                          Complete →
                        </Link>
                      ) : r.ratingStatus === "imported" ? (
                        <Link href={`/movies/${r.tmdbId}/rate`} className="flex items-center gap-1 group/tip relative">
                          {score != null && (
                            <span className="text-sm font-bold" style={{ color: scoreColor(score) }}>{score.toFixed(1)}</span>
                          )}
                          <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                        </Link>
                      ) : score != null ? (
                        <span className="text-sm font-bold" style={{ color: scoreColor(score) }}>{score.toFixed(1)}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(filtered.length > 0 || hasMore) && (
            <div className="text-center mt-4 space-y-2">
              <p className="text-xs text-[var(--foreground-muted)]">
                Showing {sorted.length} of {totalCount} ratings
                {hasMore && <span> · {totalCount - ratings.length} more not loaded</span>}
              </p>
              {hasMore && (
                <div className="flex justify-center gap-3">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-sm text-[var(--ratist-red)] hover:underline disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                  <button
                    onClick={loadAll}
                    disabled={loadingMore}
                    className="text-sm text-[var(--foreground-muted)] hover:text-white disabled:opacity-50"
                  >
                    Load all
                  </button>
                </div>
              )}
            </div>
          )}

          </>)}

          {/* ── NEEDS RATING TAB ── */}
          {tab === "needs-rating" && (
            <>
              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                {unrated.length} movie{unrated.length !== 1 ? "s" : ""} you&apos;ve seen but haven&apos;t rated yet.
              </p>

              {/* Filters for needs-rating */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..."
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] w-40" />
                </div>
                <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
                  <option value="">All genres</option>
                  {availableGenres.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <div className="flex items-center gap-1 text-xs">
                  <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                  {(["recent", "title", "year"] as const).map((s) => (
                    <button key={s} onClick={() => setUnratedSort(s)}
                      className={`px-2 py-1 rounded-md font-medium transition-colors ${unratedSort === s ? "bg-[var(--ratist-red)]/20 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                      {s === "recent" ? "Recent" : s === "title" ? "Title" : "Year"}
                    </button>
                  ))}
                </div>
              </div>

              {filteredUnrated.length === 0 ? (
                <p className="text-center text-sm text-[var(--foreground-muted)] py-8">
                  {unrated.length === 0 ? "All your seen movies have been rated!" : "No unrated movies match your filters."}
                </p>
              ) : (
                <div className="divide-y divide-[var(--border)]/10">
                  {filteredUnrated.map((m) => (
                    <div key={m.tmdbId} className="flex items-center gap-3 py-3 group">
                      <Link href={`/movies/${m.tmdbId}`} className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                        {m.posterPath && (
                          <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="40px" className="object-cover" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/movies/${m.tmdbId}`} className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                          {m.title}
                        </Link>
                        <p className="text-xs text-[var(--foreground-muted)]">{m.year}</p>
                      </div>
                      <Link
                        href={`/movies/${m.tmdbId}/rate`}
                        className="text-xs font-semibold px-3 py-1 rounded-full border border-[var(--ratist-red)] text-[var(--ratist-red)] hover:bg-[var(--ratist-red)] hover:text-white transition-colors shrink-0"
                      >
                        Rate →
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              {filteredUnrated.length > 0 && filteredUnrated.length < unrated.length && (
                <p className="text-xs text-[var(--foreground-muted)] text-center mt-4">
                  Showing {filteredUnrated.length} of {unrated.length} unrated movies
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
