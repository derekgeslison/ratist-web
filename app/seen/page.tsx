"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Search, Calendar, ArrowUpDown, ChevronLeft, ChevronRight, List, ScrollText, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import { scoreColor } from "@/lib/ratings";

interface SeenMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  genres: string[];
  voteAverage: number | null;
  ratistRating: number | null;
  seenAt: string;
  watchedDate: string | null;
}

type ViewMode = "month" | "calendar" | "all";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse date to local y/m/d to avoid timezone shifts */
function localDate(dateStr: string | null): { year: number; month: number; day: number; date: Date } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), date: d };
}

function getWatchedLocal(m: SeenMovie) {
  return localDate(m.watchedDate) ?? localDate(m.seenAt)!;
}

export default function SeenPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<SeenMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState<"" | "8+" | "6+" | "unrated">("");
  const [view, setView] = useState<ViewMode>("month");
  const [sort, setSort] = useState<"date" | "title" | "rating">("date");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

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

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of movies) years.add(getWatchedLocal(m).year);
    return [...years].sort((a, b) => b - a);
  }, [movies]);

  const availableGenres = useMemo(() => {
    const genres = new Set<string>();
    for (const m of movies) m.genres.forEach((g) => genres.add(g));
    return [...genres].sort();
  }, [movies]);

  const filtered = useMemo(() => {
    return movies.filter((m) => {
      if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (genreFilter && !m.genres.includes(genreFilter)) return false;
      if (ratingFilter === "8+" && (m.ratistRating == null || m.ratistRating < 8)) return false;
      if (ratingFilter === "6+" && (m.ratistRating == null || m.ratistRating < 6)) return false;
      if (ratingFilter === "unrated" && m.ratistRating != null) return false;
      return true;
    });
  }, [movies, query, genreFilter, ratingFilter]);

  // Month-scoped movies
  const monthMovies = useMemo(() => {
    return filtered.filter((m) => {
      const d = getWatchedLocal(m);
      return d.year === calYear && d.month === calMonth;
    }).sort((a, b) => getWatchedLocal(b).date.getTime() - getWatchedLocal(a).date.getTime());
  }, [filtered, calYear, calMonth]);

  // Group by day number for month + calendar views
  const moviesByDay = useMemo(() => {
    const map = new Map<number, SeenMovie[]>();
    for (const m of monthMovies) {
      const day = getWatchedLocal(m).day;
      const list = map.get(day) ?? [];
      list.push(m);
      map.set(day, list);
    }
    return map;
  }, [monthMovies]);

  // Sorted day numbers descending for the month list
  const sortedDays = useMemo(() => [...moviesByDay.keys()].sort((a, b) => b - a), [moviesByDay]);

  // All movies sorted for continuous scroll and "all" view
  const allSorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "rating") arr.sort((a, b) => (b.ratistRating ?? -1) - (a.ratistRating ?? -1));
    else arr.sort((a, b) => getWatchedLocal(b).date.getTime() - getWatchedLocal(a).date.getTime());
    return arr;
  }, [filtered, sort]);

  // Group all sorted by "Month Year" for continuous scroll
  const allByMonth = useMemo(() => {
    if (sort !== "date") return null; // only group when sorted by date
    const map = new Map<string, SeenMovie[]>();
    for (const m of allSorted) {
      const d = getWatchedLocal(m);
      const key = `${MONTH_NAMES[d.month]} ${d.year}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [allSorted, sort]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [calYear, calMonth]);

  const statsMovies = view === "all" ? filtered : monthMovies;
  const rated = statsMovies.filter((m) => m.ratistRating != null);
  const avgRating = rated.length > 0 ? rated.reduce((s, m) => s + m.ratistRating!, 0) / rated.length : null;

  function prevMonth() {
    setSelectedDay(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }

  /** Render a movie row (shared between month list and all view) */
  function movieRow(movie: SeenMovie, showDate: boolean) {
    const wd = getWatchedLocal(movie);
    return (
      <div key={movie.id} className="flex items-center gap-3 py-3">
        <Link href={`/movies/${movie.tmdbId}`} className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
          {movie.posterPath && (
            <Image src={posterUrl(movie.posterPath, "w92")} alt={movie.title} fill sizes="40px" className="object-cover" />
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/movies/${movie.tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
            {movie.title}
          </Link>
          <p className="text-xs text-[var(--foreground-muted)]">
            {movie.year}
            {showDate && <> · {MONTH_SHORT[wd.month]} {wd.day}, {wd.year}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {movie.voteAverage != null && movie.voteAverage > 0 && (
            <RatingBadge type="community" score={movie.voteAverage} size="sm" />
          )}
          {movie.ratistRating != null ? (
            <RatingBadge type="ratist" score={movie.ratistRating} size="sm" />
          ) : (
            <Link href={`/movies/${movie.tmdbId}/rate`} className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
              Rate
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Film Diary</h1>
        </div>
        <Link href="/watchlist" className="text-sm text-[var(--ratist-red)] hover:underline">Watchlist →</Link>
      </div>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your film diary.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading…</p>
      ) : movies.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-2">Nothing here yet.</p>
          <p className="text-sm">Click &ldquo;Mark Seen&rdquo; on any movie to start your diary.</p>
          <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
        </div>
      ) : (
        <>
          {/* Year tabs */}
          {view !== "all" && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => { setCalYear(y); setCalMonth(y === now.getFullYear() ? now.getMonth() : 0); }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
                    calYear === y ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="text-white font-bold">{statsMovies.length}</span>
            <span className="text-[var(--foreground-muted)]">movies{view !== "all" ? ` in ${MONTH_NAMES[calMonth]}` : ""}</span>
            {avgRating != null && (
              <>
                <span className="text-[var(--foreground-muted)]">·</span>
                <span className="text-[var(--foreground-muted)]">avg </span>
                <span className="font-bold" style={{ color: scoreColor(avgRating) }}>{avgRating.toFixed(1)}</span>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
              {([
                { mode: "month" as ViewMode, icon: List, label: "Month" },
                { mode: "calendar" as ViewMode, icon: Calendar, label: "Calendar" },
                { mode: "all" as ViewMode, icon: ScrollText, label: "All" },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  title={label}
                  className={`p-2 transition-colors ${view === mode ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
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
            <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as typeof ratingFilter)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]">
              <option value="">All ratings</option>
              <option value="8+">8+ rated</option>
              <option value="6+">6+ rated</option>
              <option value="unrated">Unrated only</option>
            </select>
            {view === "all" && (
              <div className="flex items-center gap-1 text-xs">
                <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                {(["date", "title", "rating"] as const).map((s) => (
                  <button key={s} onClick={() => setSort(s)}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${sort === s ? "bg-[var(--ratist-red)]/20 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                    {s === "date" ? "Date" : s === "rating" ? "Rating" : "Title"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Month navigation (month + calendar views) */}
          {view !== "all" && (
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold text-white">{MONTH_NAMES[calMonth]} {calYear}</h2>
              <button onClick={nextMonth} className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── MONTH LIST VIEW ── */}
          {view === "month" && (
            monthMovies.length === 0 ? (
              <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
            ) : (
              <div>
                {sortedDays.flatMap((day) => {
                  const dayMovies = moviesByDay.get(day) ?? [];
                  const dayLabel = `${DAY_LABELS[new Date(calYear, calMonth, day).getDay()]}, ${MONTH_SHORT[calMonth]} ${day}`;
                  return [
                    <div key={`h-${day}`} className="sticky top-0 z-10 bg-[var(--background)] pt-3 pb-2 border-b border-[var(--border)]/20">
                      <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">{dayLabel}</p>
                    </div>,
                    ...dayMovies.map((m) => movieRow(m, false)),
                  ];
                })}
              </div>
            )
          )}

          {/* ── CALENDAR VIEW ── */}
          {view === "calendar" && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="text-center text-xs text-[var(--foreground-muted)] py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} />;
                  const dayMovies = moviesByDay.get(day) ?? [];
                  const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
                  const hasMovies = dayMovies.length > 0;
                  return (
                    <button key={day} type="button"
                      onClick={() => hasMovies && setSelectedDay(selectedDay === day ? null : day)}
                      className={`min-h-[80px] sm:min-h-[100px] rounded-lg border p-1 transition-colors text-left ${
                        selectedDay === day ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                        : hasMovies ? "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ratist-red)]/50 cursor-pointer"
                        : isToday ? "border-[var(--ratist-red)]/30 bg-[var(--ratist-red)]/5 cursor-default"
                        : "border-transparent cursor-default"
                      }`}>
                      <span className={`text-[10px] block mb-0.5 ${isToday ? "text-[var(--ratist-red)] font-bold" : "text-[var(--foreground-muted)]"}`}>{day}</span>
                      <div className="flex flex-wrap gap-0.5 pointer-events-none">
                        {dayMovies.slice(0, 4).map((m) => (
                          m.posterPath ? (
                            <div key={m.id} className="relative w-6 h-9 sm:w-8 sm:h-12 rounded-sm overflow-hidden">
                              <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />
                            </div>
                          ) : (
                            <div key={m.id} className="w-6 h-9 sm:w-8 sm:h-12 rounded-sm bg-[var(--surface-2)] flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">?</div>
                          )
                        ))}
                        {dayMovies.length > 4 && <span className="text-[8px] text-[var(--foreground-muted)] self-end">+{dayMovies.length - 4}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Day detail popup */}
              {selectedDay !== null && (moviesByDay.get(selectedDay) ?? []).length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={(e) => { if (e.target === e.currentTarget) setSelectedDay(null); }}>
                  <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 max-h-[80vh] overflow-y-auto mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-white">{MONTH_NAMES[calMonth]} {selectedDay}, {calYear}</h3>
                      <button onClick={() => setSelectedDay(null)} className="text-[var(--foreground-muted)] hover:text-white transition-colors text-sm">Close</button>
                    </div>
                    <div className="space-y-1">
                      {(moviesByDay.get(selectedDay) ?? []).map((m) => movieRow(m, false))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ALL VIEW (continuous scroll) ── */}
          {view === "all" && (
            <div>
              {sort === "date" && allByMonth ? (
                // Grouped by month headers for continuous scroll
                [...allByMonth.entries()].flatMap(([monthLabel, monthMovies]) => [
                  <div key={`mh-${monthLabel}`} className="sticky top-0 z-10 bg-[var(--background)] pt-4 pb-2 border-b border-[var(--border)]/30">
                    <h3 className="text-sm font-bold text-white">{monthLabel}</h3>
                  </div>,
                  ...monthMovies.map((m) => movieRow(m, true)),
                ])
              ) : (
                // Flat list when sorted by title or rating
                allSorted.map((m) => movieRow(m, true))
              )}
            </div>
          )}

          {filtered.length === 0 && movies.length > 0 && (
            <div className="text-center py-12 text-[var(--foreground-muted)]">
              <p>No movies match your filters.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
