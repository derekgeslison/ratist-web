"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Search, Calendar, ArrowUpDown, ChevronLeft, ChevronRight, List, ScrollText, Sparkles, Film, Tv } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import DiaryRow from "@/components/DiaryRow";
import ShareButton from "@/components/ShareButton";
import { scoreColor } from "@/lib/ratings";

interface SeenMovie {
  id: string;
  logId: string | null;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  genres: string[];
  voteAverage: number | null;
  ratistRating: number | null;
  seenAt: string;
  watchedDate: string | null;
  isRewatch: boolean;
  notes: string | null;
  mediaType?: "movie" | "tv";
}

type ViewMode = "month" | "calendar" | "all";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWatchDate(m: SeenMovie): Date | null {
  const str = m.watchedDate;
  if (!str) return null; // no date = undated entry
  if (str.length === 10 && str[4] === "-") return new Date(`${str}T12:00:00`);
  return new Date(str);
}

function getWatchDateOrFallback(m: SeenMovie): Date {
  return getWatchDate(m) ?? new Date(m.seenAt);
}

export default function SeenPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<SeenMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState<"" | "8+" | "6+" | "unrated">("");
  const [view, setView] = useState<ViewMode>("month");
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">("all");
  const [sort, setSort] = useState<"date" | "title" | "rating">("date");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  function updateWatchedDate(tmdbId: number, date: string | null) {
    if (!user) return;
    const safeDate = date ? (date.includes("T") ? date : `${date}T12:00:00`) : null;
    // Optimistic update
    setMovies((prev) => prev.map((m) => (m.tmdbId === tmdbId && !m.isRewatch ? { ...m, watchedDate: safeDate } : m)));
    // Persist to server
    user.getIdToken().then((token) => {
      fetch(`/api/movies/${tmdbId}/seen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ watchedDate: date }),
      }).then((res) => {
        if (!res.ok) {
          // Revert on failure
          console.error("Failed to save date change");
          setMovies((prev) => prev.map((m) => (m.tmdbId === tmdbId && !m.isRewatch ? { ...m, watchedDate: null } : m)));
        }
      }).catch(() => {
        console.error("Network error saving date");
        setMovies((prev) => prev.map((m) => (m.tmdbId === tmdbId && !m.isRewatch ? { ...m, watchedDate: null } : m)));
      });
    });
  }

  function deleteRewatch(logId: string) {
    if (!user) return;
    // Optimistic removal
    const removed = movies.find((m) => m.logId === logId);
    setMovies((prev) => prev.filter((m) => m.logId !== logId));
    user.getIdToken().then((token) => {
      fetch(`/api/watchlog/${logId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!res.ok) {
            console.error("Failed to delete rewatch");
            if (removed) setMovies((prev) => [...prev, removed]);
          }
        })
        .catch(() => {
          console.error("Network error deleting rewatch");
          if (removed) setMovies((prev) => [...prev, removed]);
        });
    });
  }

  function editRewatchNotes(logId: string, notes: string) {
    if (!user) return;
    // Optimistic update
    const prev = movies.find((m) => m.logId === logId)?.notes ?? null;
    setMovies((ms) => ms.map((m) => (m.logId === logId ? { ...m, notes } : m)));
    user.getIdToken().then((token) => {
      fetch(`/api/watchlog/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error("Failed to save rewatch notes");
            setMovies((ms) => ms.map((m) => (m.logId === logId ? { ...m, notes: prev } : m)));
          }
        })
        .catch(() => {
          console.error("Network error saving rewatch notes");
          setMovies((ms) => ms.map((m) => (m.logId === logId ? { ...m, notes: prev } : m)));
        });
    });
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
    for (const m of movies) { const d = getWatchDate(m); if (d) years.add(d.getFullYear()); }
    return [...years].sort((a, b) => b - a);
  }, [movies]);

  const availableGenres = useMemo(() => {
    const genres = new Set<string>();
    for (const m of movies) m.genres.forEach((g) => genres.add(g));
    return [...genres].sort();
  }, [movies]);

  const filtered = useMemo(() => {
    return movies.filter((m) => {
      if (mediaFilter !== "all" && (m.mediaType ?? "movie") !== mediaFilter) return false;
      if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (genreFilter && !m.genres.includes(genreFilter)) return false;
      if (ratingFilter === "8+" && (m.ratistRating == null || m.ratistRating < 8)) return false;
      if (ratingFilter === "6+" && (m.ratistRating == null || m.ratistRating < 6)) return false;
      if (ratingFilter === "unrated" && m.ratistRating != null) return false;
      return true;
    });
  }, [movies, query, genreFilter, ratingFilter, mediaFilter]);

  const datedMovies = useMemo(() => filtered.filter((m) => m.watchedDate != null), [filtered]);
  const undatedMovies = useMemo(() => filtered.filter((m) => m.watchedDate == null), [filtered]);

  const monthMovies = useMemo(() => {
    return datedMovies.filter((m) => {
      const d = getWatchDate(m)!;
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    }).sort((a, b) => getWatchDate(b)!.getTime() - getWatchDate(a)!.getTime());
  }, [datedMovies, calYear, calMonth]);

  const moviesByDay = useMemo(() => {
    const map = new Map<number, SeenMovie[]>();
    for (const m of monthMovies) {
      const day = getWatchDate(m)!.getDate();
      const list = map.get(day) ?? [];
      list.push(m);
      map.set(day, list);
    }
    return map;
  }, [monthMovies]);

  const sortedDays = useMemo(() => [...moviesByDay.keys()].sort((a, b) => b - a), [moviesByDay]);

  const allSorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "rating") arr.sort((a, b) => (b.ratistRating ?? -1) - (a.ratistRating ?? -1));
    else arr.sort((a, b) => getWatchDateOrFallback(b).getTime() - getWatchDateOrFallback(a).getTime());
    return arr;
  }, [filtered, sort]);

  const allByMonth = useMemo(() => {
    if (sort !== "date") return null;
    const map = new Map<string, { label: string; movies: SeenMovie[] }>();
    for (const m of allSorted) {
      const d = getWatchDate(m);
      if (!d) continue; // undated handled separately
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const existing = map.get(key);
      if (existing) existing.movies.push(m);
      else map.set(key, { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, movies: [m] });
    }
    return map;
  }, [allSorted, sort]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [calYear, calMonth]);

  // Throwback: movies watched on this day in previous years (1, 2, 3 years ago)
  const throwbacks = useMemo(() => {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    const todayYear = today.getFullYear();
    const results: { yearsAgo: number; movie: SeenMovie }[] = [];
    for (const m of movies) {
      if (!m.watchedDate) continue;
      // Extract date parts directly from the string to avoid ANY timezone parsing
      const dateStr = typeof m.watchedDate === "string" ? m.watchedDate : "";
      const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!parts) continue;
      const mYear = parseInt(parts[1]);
      const mMonth = parseInt(parts[2]) - 1; // 0-indexed
      const mDay = parseInt(parts[3]);
      if (mMonth === todayMonth && mDay === todayDay) {
        const yearsAgo = todayYear - mYear;
        if (yearsAgo >= 1 && yearsAgo <= 3) results.push({ yearsAgo, movie: m });
      }
    }
    return results.sort((a, b) => a.yearsAgo - b.yearsAgo);
  }, [movies]);

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

  /** Render diary rows for a list of movies grouped by day, with day numbers on the left */
  function renderDayRows(dayMovies: SeenMovie[], day: number, editable: boolean) {
    return dayMovies.map((m, idx) => {
      const wd = m.watchedDate ? getWatchDate(m) : null;
          const dateVal = wd ? `${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,"0")}-${String(wd.getDate()).padStart(2,"0")}` : "";
      return (
        <DiaryRow
          key={m.id}
          tmdbId={m.tmdbId}
          title={m.title}
          posterPath={m.posterPath}
          year={m.year}
          ratistRating={m.ratistRating}
          voteAverage={m.voteAverage}
          dayNumber={idx === 0 ? day : null}
          editable={editable}
          dateValue={dateVal}
          onDateChange={(date) => updateWatchedDate(m.tmdbId, date)}
          isRewatch={m.isRewatch}
          notes={m.notes}
          logId={m.logId}
          onDeleteRewatch={deleteRewatch}
          onEditNotes={editRewatchNotes}
          mediaType={m.mediaType}
        />
      );
    });
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
          <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
        </div>
      ) : (
        <>
          {/* Year tabs (month + calendar only) */}
          {view !== "all" && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
              {availableYears.map((y) => (
                <button key={y} onClick={() => { setCalYear(y); setCalMonth(y === now.getFullYear() ? now.getMonth() : 0); }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${calYear === y ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="text-white font-bold">{statsMovies.length}</span>
            <span className="text-[var(--foreground-muted)]">{mediaFilter === "tv" ? "shows" : mediaFilter === "movie" ? "movies" : statsMovies.some((m) => m.mediaType === "tv") && statsMovies.some((m) => (m.mediaType ?? "movie") === "movie") ? "movies & shows" : statsMovies.some((m) => m.mediaType === "tv") ? "shows" : "movies"}{view !== "all" ? ` in ${MONTH_NAMES[calMonth]}` : ""}</span>
            {avgRating != null && (
              <>
                <span className="text-[var(--foreground-muted)]">· avg</span>
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
                <button key={mode} onClick={() => setView(mode)} title={label}
                  className={`p-2 transition-colors ${view === mode ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
              <button onClick={() => setMediaFilter("all")} title="All"
                className={`px-2.5 py-2 text-xs font-medium transition-colors ${mediaFilter === "all" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                All
              </button>
              <button onClick={() => setMediaFilter("movie")} title="Movies"
                className={`p-2 transition-colors ${mediaFilter === "movie" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                <Film className="w-4 h-4" />
              </button>
              <button onClick={() => setMediaFilter("tv")} title="TV Shows"
                className={`p-2 transition-colors ${mediaFilter === "tv" ? "bg-blue-600 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                <Tv className="w-4 h-4" />
              </button>
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

          {/* Throwback banner */}
          {throwbacks.length > 0 && (
            <div className="bg-gradient-to-r from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" />
                <span className="text-xs font-semibold text-[var(--ratist-red)] uppercase tracking-wider">On this day</span>
              </div>
              <div className="space-y-2">
                {throwbacks.map(({ yearsAgo, movie: m }) => (
                  <Link key={`${m.id}-${yearsAgo}`} href={m.mediaType === "tv" ? `/shows/${m.tmdbId}` : `/movies/${m.tmdbId}`} className="flex items-center gap-3 group">
                    <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                      {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.title}</span>
                      <span className="text-xs text-[var(--foreground-muted)]"> · {yearsAgo} year{yearsAgo !== 1 ? "s" : ""} ago</span>
                    </div>
                    {m.ratistRating != null && (
                      <span className="text-xs font-bold shrink-0" style={{ color: scoreColor(m.ratistRating) }}>{m.ratistRating.toFixed(1)}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Month navigation + share */}
          {view !== "all" && (
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">{MONTH_NAMES[calMonth]} {calYear}</h2>
                {view === "month" && monthMovies.length > 0 && user && (
                  <ShareButton
                    label="Share"
                    text={`My ${MONTH_NAMES[calMonth]} ${calYear} in film: ${monthMovies.length} ${monthMovies.some((m) => m.mediaType === "tv") && monthMovies.some((m) => (m.mediaType ?? "movie") === "movie") ? "movies & shows" : monthMovies.some((m) => m.mediaType === "tv") ? "shows" : `movie${monthMovies.length !== 1 ? "s" : ""}`} watched${avgRating != null ? `, avg rating ${avgRating.toFixed(1)}` : ""}. Check it out on The Ratist!`}
                    url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/seen`}
                    cardImageUrl={`/api/og/month?userId=${encodeURIComponent(user.uid)}&year=${calYear}&month=${calMonth}`}
                  />
                )}
              </div>
              <button onClick={nextMonth} className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── MONTH VIEW ── */}
          {view === "month" && (
            monthMovies.length === 0 ? (
              <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
            ) : (
              <div>
                {sortedDays.map((day) => {
                  const dayMovies = moviesByDay.get(day) ?? [];
                  const dayOfWeek = DAY_LABELS[new Date(calYear, calMonth, day).getDay()];
                  return (
                    <div key={day}>
                      <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/20">
                        <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                          {dayOfWeek}, {MONTH_NAMES[calMonth].slice(0, 3)} {day}
                        </span>
                      </div>
                      {renderDayRows(dayMovies, day, true)}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── CALENDAR VIEW ── */}
          {view === "calendar" && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_LABELS.map((d) => <div key={d} className="text-center text-xs text-[var(--foreground-muted)] py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} />;
                  const dayMovies = moviesByDay.get(day) ?? [];
                  const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
                  const hasMovies = dayMovies.length > 0;
                  return (
                    <button key={day} type="button" onClick={() => hasMovies && setSelectedDay(selectedDay === day ? null : day)}
                      className={`min-h-[80px] sm:min-h-[100px] rounded-lg border p-1 transition-colors text-left ${
                        selectedDay === day ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                        : hasMovies ? "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--ratist-red)]/50 cursor-pointer"
                        : isToday ? "border-[var(--ratist-red)]/30 bg-[var(--ratist-red)]/5 cursor-default" : "border-transparent cursor-default"
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
              {selectedDay !== null && (moviesByDay.get(selectedDay) ?? []).length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={(e) => { if (e.target === e.currentTarget) setSelectedDay(null); }}>
                  <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 max-h-[80vh] overflow-y-auto mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-white">{MONTH_NAMES[calMonth]} {selectedDay}, {calYear}</h3>
                      <button onClick={() => setSelectedDay(null)} className="text-[var(--foreground-muted)] hover:text-white transition-colors text-sm">Close</button>
                    </div>
                    {renderDayRows(moviesByDay.get(selectedDay) ?? [], selectedDay, true)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ALL VIEW ── */}
          {view === "all" && (
            <div>
              {sort === "date" && allByMonth ? (
                [...allByMonth.values()].map(({ label, movies: mlist }) => (
                  <div key={label}>
                    <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/30">
                      <h3 className="text-xs font-bold text-[var(--foreground-muted)] uppercase tracking-widest">{label}</h3>
                    </div>
                    {mlist.map((m, idx) => {
                      const d = getWatchDate(m) ?? getWatchDateOrFallback(m);
                      const prevDay = idx > 0 ? (getWatchDate(mlist[idx - 1]) ?? getWatchDateOrFallback(mlist[idx - 1])).getDate() : null;
                      const showDay = idx === 0 || d.getDate() !== prevDay;
                      const wd = m.watchedDate ? getWatchDate(m) : null;
          const dateVal = wd ? `${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,"0")}-${String(wd.getDate()).padStart(2,"0")}` : "";
                      return (
                        <DiaryRow
                          key={m.id}
                          tmdbId={m.tmdbId}
                          title={m.title}
                          posterPath={m.posterPath}
                          year={m.year}
                          ratistRating={m.ratistRating}
                          voteAverage={m.voteAverage}
                          dayNumber={showDay ? d.getDate() : null}
                          editable
                          dateValue={dateVal}
                          onDateChange={(date) => updateWatchedDate(m.tmdbId, date)}
                          isRewatch={m.isRewatch}
                          notes={m.notes}
                          logId={m.logId}
                          onDeleteRewatch={deleteRewatch}
                          onEditNotes={editRewatchNotes}
                          mediaType={m.mediaType}
                        />
                      );
                    })}
                  </div>
                ))
              ) : (
                allSorted.map((m) => {
                  const d = getWatchDate(m) ?? getWatchDateOrFallback(m);
                  const wd = m.watchedDate ? getWatchDate(m) : null;
          const dateVal = wd ? `${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,"0")}-${String(wd.getDate()).padStart(2,"0")}` : "";
                  return (
                    <DiaryRow
                      key={m.id}
                      tmdbId={m.tmdbId}
                      title={m.title}
                      posterPath={m.posterPath}
                      year={m.year}
                      ratistRating={m.ratistRating}
                      voteAverage={m.voteAverage}
                      dayNumber={d.getDate()}
                      editable
                      dateValue={dateVal}
                      onDateChange={(date) => updateWatchedDate(m.tmdbId, date)}
                      isRewatch={m.isRewatch}
                      notes={m.notes}
                      logId={m.logId}
                      onDeleteRewatch={deleteRewatch}
                      onEditNotes={editRewatchNotes}
                      mediaType={m.mediaType}
                    />
                  );
                })
              )}
              {/* Undated movies at the bottom */}
              {undatedMovies.length > 0 && sort === "date" && (
                <>
                  <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/30 mt-4">
                    <h3 className="text-xs font-bold text-[var(--foreground-muted)] uppercase tracking-widest">No date set</h3>
                  </div>
                  {undatedMovies.map((m) => (
                    <DiaryRow
                      key={m.id}
                      tmdbId={m.tmdbId}
                      title={m.title}
                      posterPath={m.posterPath}
                      year={m.year}
                      ratistRating={m.ratistRating}
                      voteAverage={m.voteAverage}
                      dayNumber={null}
                      editable
                      dateValue=""
                      onDateChange={(date) => updateWatchedDate(m.tmdbId, date)}
                      mediaType={m.mediaType}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {filtered.length === 0 && movies.length > 0 && (
            <div className="text-center py-12 text-[var(--foreground-muted)]"><p>No entries match your filters.</p></div>
          )}
        </>
      )}
    </div>
  );
}
