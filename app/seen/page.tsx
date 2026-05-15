"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { Eye, Search, Calendar, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, List, ScrollText, Sparkles, Film, Tv, Filter, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import DiaryRow from "@/components/DiaryRow";
import DiaryEpisodeRow from "@/components/DiaryEpisodeRow";
import ShareButton from "@/components/ShareButton";
import FirstVisitHint from "@/components/FirstVisitHint";
import { scoreColor } from "@/lib/score-color";
import { isYearInReviewUnlocked, unlockTeaser } from "@/lib/year-in-review/lock";

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

interface EpisodeGroup {
  showTmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  watchedDate: string | null;
  seasonCount: number;
  episodeCount: number;
  seasons: { seasonNumber: number; episodeCount: number }[];
  episodes: { seasonNumber: number; episodeNumber: number; name: string | null }[];
  ratistRating?: number | null;
}

type SeenEntry = (SeenMovie & { _type: "movie" }) | (EpisodeGroup & { _type: "episode"; id: string; seenAt: string });

type ViewMode = "month" | "calendar" | "all";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

function getWatchDate(m: { watchedDate: string | null }): Date | null {
  const str = m.watchedDate;
  if (!str) return null; // no date = undated entry
  const d = str.length === 10 && str[4] === "-" ? new Date(`${str}T12:00:00`) : new Date(str);
  // Reject Invalid Date so callers can treat malformed timestamps the
  // same as "undated" instead of rendering NaN.
  return isValidDate(d) ? d : null;
}

function getWatchDateOrFallback(m: SeenEntry): Date | null {
  const wd = getWatchDate(m);
  if (wd) return wd;
  if (!m.seenAt) return null;
  const fb = new Date(m.seenAt);
  return isValidDate(fb) ? fb : null;
}

const DIARY_KEY = "ratist-diary-state";

export default function SeenPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<SeenMovie[]>([]);
  const [episodeGroups, setEpisodeGroups] = useState<EpisodeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore view + filter state from sessionStorage so back-nav from
  // a movie/show detail preserves what the user had set. Was only
  // persisting view prefs (view/sort/calendar) before — the filter
  // bar's text/genre/rating/year/etc. settings would reset on every
  // remount, losing intent.
  const restored = typeof window !== "undefined" ? (() => { try { return JSON.parse(sessionStorage.getItem(DIARY_KEY) ?? "{}"); } catch { return {}; } })() : {};
  const [query, setQuery] = useState(restored.query ?? "");
  const [genreFilter, setGenreFilter] = useState(restored.genreFilter ?? "");
  const [ratingFilter, setRatingFilter] = useState<"" | "8+" | "6+" | "unrated">(restored.ratingFilter ?? "");
  const [releaseYearFrom, setReleaseYearFrom] = useState(restored.releaseYearFrom ?? "");
  const [releaseYearTo, setReleaseYearTo] = useState(restored.releaseYearTo ?? "");
  const [watchDateFrom, setWatchDateFrom] = useState(restored.watchDateFrom ?? "");
  const [watchDateTo, setWatchDateTo] = useState(restored.watchDateTo ?? "");
  const [rewatchFilter, setRewatchFilter] = useState<"all" | "first" | "rewatch">(restored.rewatchFilter ?? "all");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(restored.view ?? "all");
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">(restored.mediaFilter ?? "all");
  const [sort, setSort] = useState<"date" | "title" | "rating">(restored.sort ?? "date");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(restored.calYear ?? now.getFullYear());
  const [calMonth, setCalMonth] = useState(restored.calMonth ?? now.getMonth());

  // Persist everything that affects the rendered list. Includes filters
  // (text + dropdown + date range + rewatch toggle) alongside the view-
  // pref bundle so a single key round-trips the full UI snapshot.
  useEffect(() => {
    try {
      sessionStorage.setItem(DIARY_KEY, JSON.stringify({
        view, mediaFilter, sort, calYear, calMonth,
        query, genreFilter, ratingFilter,
        releaseYearFrom, releaseYearTo, watchDateFrom, watchDateTo, rewatchFilter,
      }));
    } catch { /* ignore */ }
  }, [view, mediaFilter, sort, calYear, calMonth, query, genreFilter, ratingFilter, releaseYearFrom, releaseYearTo, watchDateFrom, watchDateTo, rewatchFilter]);

  function refetchEpisodeGroups() {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/seen", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setEpisodeGroups(data.episodeGroups ?? []); })
        .catch(() => {});
    });
  }

  function updateEpisodeGroupDate(showTmdbId: number, oldDate: string | null, newDate: string | null) {
    const safeDate = newDate ? (newDate.includes("T") ? newDate : `${newDate}T12:00:00`) : null;
    setEpisodeGroups((prev) => prev.map((g) =>
      g.showTmdbId === showTmdbId && g.watchedDate === oldDate ? { ...g, watchedDate: safeDate } : g
    ));
  }

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
        .then((data) => { setMovies(data.movies ?? []); setEpisodeGroups(data.episodeGroups ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user]);

  // Merge movies + episode groups into unified entries
  const entries: SeenEntry[] = useMemo(() => {
    const movieEntries: SeenEntry[] = movies.map((m) => ({ ...m, _type: "movie" as const }));
    const epEntries: SeenEntry[] = episodeGroups.map((eg) => ({
      ...eg,
      _type: "episode" as const,
      id: `ep-${eg.showTmdbId}-${eg.watchedDate ?? "undated"}`,
      seenAt: eg.watchedDate ?? new Date().toISOString(),
    }));
    return [...movieEntries, ...epEntries];
  }, [movies, episodeGroups]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const m of entries) { const d = getWatchDate(m); if (d) years.add(d.getFullYear()); }
    return [...years].sort((a, b) => b - a);
  }, [entries]);

  const availableGenres = useMemo(() => {
    const genres = new Set<string>();
    for (const m of movies) m.genres.forEach((g) => genres.add(g));
    return [...genres].sort();
  }, [movies]);

  const filtered: SeenEntry[] = useMemo(() => {
    const yFrom = releaseYearFrom ? parseInt(releaseYearFrom, 10) : null;
    const yTo = releaseYearTo ? parseInt(releaseYearTo, 10) : null;
    const wFrom = watchDateFrom || null;
    const wTo = watchDateTo || null;

    function passesReleaseYear(yearStr: string): boolean {
      if (!yFrom && !yTo) return true;
      const y = parseInt(yearStr, 10);
      if (!Number.isFinite(y)) return false;
      if (yFrom != null && y < yFrom) return false;
      if (yTo != null && y > yTo) return false;
      return true;
    }
    function passesWatchDate(dateStr: string | null): boolean {
      if (!wFrom && !wTo) return true;
      if (!dateStr) return false; // undated entries can't satisfy a date range
      const d = dateStr.slice(0, 10);
      if (wFrom && d < wFrom) return false;
      if (wTo && d > wTo) return false;
      return true;
    }

    return entries.filter((m) => {
      if (m._type === "episode") {
        if (mediaFilter === "movie") return false;
        if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
        if (ratingFilter === "8+" && (m.ratistRating == null || m.ratistRating < 8)) return false;
        if (ratingFilter === "6+" && (m.ratistRating == null || m.ratistRating < 6)) return false;
        if (ratingFilter === "unrated" && m.ratistRating != null) return false;
        if (!passesReleaseYear(m.year)) return false;
        if (!passesWatchDate(m.watchedDate)) return false;
        // Episode groups don't track isRewatch at the group level — skip rewatch filter for them
        return true;
      }
      if (mediaFilter !== "all" && (m.mediaType ?? "movie") !== mediaFilter) return false;
      if (query && !m.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (genreFilter && !m.genres.includes(genreFilter)) return false;
      if (ratingFilter === "8+" && (m.ratistRating == null || m.ratistRating < 8)) return false;
      if (ratingFilter === "6+" && (m.ratistRating == null || m.ratistRating < 6)) return false;
      if (ratingFilter === "unrated" && m.ratistRating != null) return false;
      if (!passesReleaseYear(m.year)) return false;
      if (!passesWatchDate(m.watchedDate)) return false;
      if (rewatchFilter === "rewatch" && !m.isRewatch) return false;
      if (rewatchFilter === "first" && m.isRewatch) return false;
      return true;
    });
  }, [entries, query, genreFilter, ratingFilter, mediaFilter, releaseYearFrom, releaseYearTo, watchDateFrom, watchDateTo, rewatchFilter]);

  // "dated" must mean watchedDate parses to a valid Date, not just
  // that the field is non-null. An imported entry can have a string
  // value that produces an Invalid Date — those belong with undated.
  const datedEntries = useMemo(() => filtered.filter((m) => getWatchDate(m) != null), [filtered]);
  const undatedEntries = useMemo(() => filtered.filter((m) => getWatchDate(m) == null), [filtered]);

  const monthEntries = useMemo(() => {
    return datedEntries.filter((m) => {
      const d = getWatchDate(m)!;
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    }).sort((a, b) => getWatchDate(b)!.getTime() - getWatchDate(a)!.getTime());
  }, [datedEntries, calYear, calMonth]);

  const entriesByDay = useMemo(() => {
    const map = new Map<number, SeenEntry[]>();
    for (const m of monthEntries) {
      const day = getWatchDate(m)!.getDate();
      const list = map.get(day) ?? [];
      list.push(m);
      map.set(day, list);
    }
    return map;
  }, [monthEntries]);

  const sortedDays = useMemo(() => [...entriesByDay.keys()].sort((a, b) => b - a), [entriesByDay]);

  const allSorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "title") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "rating") arr.sort((a, b) => ((b.ratistRating ?? -1) - (a.ratistRating ?? -1)));
    else arr.sort((a, b) => (getWatchDateOrFallback(b)?.getTime() ?? 0) - (getWatchDateOrFallback(a)?.getTime() ?? 0));
    return arr;
  }, [filtered, sort]);

  const allByMonth = useMemo(() => {
    if (sort !== "date") return null;
    const map = new Map<string, { label: string; entries: SeenEntry[] }>();
    for (const m of allSorted) {
      const d = getWatchDate(m);
      if (!d) continue; // undated handled separately
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const existing = map.get(key);
      if (existing) existing.entries.push(m);
      else map.set(key, { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, entries: [m] });
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

  const statsEntries = view === "all" ? filtered : monthEntries;
  const rated = statsEntries.filter((m) => m.ratistRating != null);
  const avgRating = rated.length > 0 ? rated.reduce((s, m) => s + m.ratistRating!, 0) / rated.length : null;

  function prevMonth() {
    setSelectedDay(null);
    if (calMonth === 0) { setCalMonth(11); setCalYear((y: number) => y - 1); }
    else setCalMonth((m: number) => m - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calMonth === 11) { setCalMonth(0); setCalYear((y: number) => y + 1); }
    else setCalMonth((m: number) => m + 1);
  }

  /** Render diary rows for a list of entries grouped by day, with day numbers on the left */
  function renderDayRows(dayEntries: SeenEntry[], day: number, editable: boolean) {
    return dayEntries.map((m, idx) => {
      if (m._type === "episode") {
        return (
          <DiaryEpisodeRow
            key={m.id}
            showTmdbId={m.showTmdbId}
            title={m.title}
            posterPath={m.posterPath}
            year={m.year}
            dayNumber={idx === 0 ? day : null}
            watchedDate={m.watchedDate}
            seasonCount={m.seasonCount}
            episodeCount={m.episodeCount}
            seasons={m.seasons}
            episodes={m.episodes}
            ratistRating={m.ratistRating}
            onDateChange={(newDate) => updateEpisodeGroupDate(m.showTmdbId, m.watchedDate, newDate)}
                            onEpisodeDateChange={refetchEpisodeGroups}
          />
        );
      }
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com";
  const seenInCalYear = useMemo(() => {
    return movies.filter((m) => {
      const d = m.watchedDate ?? m.seenAt;
      return d && new Date(d).getFullYear() === calYear;
    }).length;
  }, [movies, calYear]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Film Diary</h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {user && seenInCalYear > 0 && (
            <ShareButton
              label="Share my diary"
              text={`I've watched ${movies.length}+ films on The Ratist. Check out my film diary.`}
              url={`${siteUrl}/profile/${user.uid}#diary`}
              cardImageUrl={`/api/og/seen?userId=${encodeURIComponent(user.uid)}`}
            />
          )}
          {user && (
            isYearInReviewUnlocked(calYear, false) ? (
              <Link href={`/profile/${user.uid}/year-in-review/${calYear}`} className="text-sm text-[var(--ratist-red)] hover:underline">
                Year in Review →
              </Link>
            ) : (
              <span className="text-sm text-[var(--foreground-muted)]">
                Year in Review unlocks {unlockTeaser(calYear)}
              </span>
            )
          )}
          {user && (
            <Link href="/profile/import" className="text-sm text-[var(--ratist-red)] hover:underline">
              Import from Letterboxd / IMDb →
            </Link>
          )}
        </div>
      </div>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to see your film diary.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading…</p>
      ) : movies.length === 0 && episodeGroups.length === 0 ? (
        <>
          <FirstVisitHint
            storageKey="diary-empty"
            icon={Eye}
            title="Welcome to your Film Diary"
            cta={{ label: "Browse movies", href: "/movies" }}
          >
            Mark Seen on any movie or show page to log it. Set the date you watched and a rating; it lands here forever, sortable by date, year, or score. Other users can browse your diary too — it&rsquo;s how taste-twins find each other.
          </FirstVisitHint>
          <div className="text-center py-16 text-[var(--foreground-muted)]">
            <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="mb-2">Nothing here yet.</p>
            <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse movies →</Link>
          </div>
        </>
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
            <span className="text-white font-bold">{statsEntries.length}</span>
            <span className="text-[var(--foreground-muted)]">{mediaFilter === "tv" ? "shows" : mediaFilter === "movie" ? "movies" : statsEntries.some((m) => m._type === "episode" || (m._type === "movie" && m.mediaType === "tv")) && statsEntries.some((m) => m._type === "movie" && (m.mediaType ?? "movie") === "movie") ? "movies & shows" : statsEntries.some((m) => m._type === "episode" || (m._type === "movie" && m.mediaType === "tv")) ? "shows" : "movies"}{view !== "all" ? ` in ${MONTH_NAMES[calMonth]}` : ""}</span>
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
                { mode: "all" as ViewMode, icon: ScrollText, label: "All" },
                { mode: "month" as ViewMode, icon: List, label: "Month" },
                { mode: "calendar" as ViewMode, icon: Calendar, label: "Calendar" },
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
            {(() => {
              const moreCount = [releaseYearFrom || releaseYearTo, watchDateFrom || watchDateTo, rewatchFilter !== "all"].filter(Boolean).length;
              return (
                <button
                  onClick={() => setMoreFiltersOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    moreFiltersOpen || moreCount > 0
                      ? "border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10"
                      : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  More filters
                  {moreCount > 0 && (
                    <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{moreCount}</span>
                  )}
                  {moreFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              );
            })()}
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

          {/* More filters shelf */}
          {moreFiltersOpen && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Release year range */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1.5">Release year</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="From"
                      value={releaseYearFrom}
                      onChange={(e) => setReleaseYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                    />
                    <span className="text-[var(--foreground-muted)] text-sm">–</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="To"
                      value={releaseYearTo}
                      onChange={(e) => setReleaseYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                    />
                  </div>
                </div>

                {/* First-time vs rewatch */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1.5">Watch type</label>
                  <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
                    {([
                      { key: "all" as const, label: "All" },
                      { key: "first" as const, label: "First time" },
                      { key: "rewatch" as const, label: "Rewatches" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setRewatchFilter(key)}
                        className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                          rewatchFilter === key ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Watch date range — own full-width row so two date pickers fit */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1.5">Watched between</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={watchDateFrom}
                      onChange={(e) => setWatchDateFrom(e.target.value)}
                      className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]"
                    />
                    <span className="text-[var(--foreground-muted)] text-sm">–</span>
                    <input
                      type="date"
                      value={watchDateTo}
                      onChange={(e) => setWatchDateTo(e.target.value)}
                      className="min-w-0 flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              {(releaseYearFrom || releaseYearTo || watchDateFrom || watchDateTo || rewatchFilter !== "all") && (
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setReleaseYearFrom("");
                      setReleaseYearTo("");
                      setWatchDateFrom("");
                      setWatchDateTo("");
                      setRewatchFilter("all");
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear more filters
                  </button>
                </div>
              )}
            </div>
          )}

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
                {view === "month" && monthEntries.length > 0 && user && (
                  <ShareButton
                    label="Share"
                    text={`My ${MONTH_NAMES[calMonth]} ${calYear} in film: ${monthEntries.length} ${monthEntries.some((m) => m._type === "episode" || (m._type === "movie" && m.mediaType === "tv")) && monthEntries.some((m) => m._type === "movie" && (m.mediaType ?? "movie") === "movie") ? "movies & shows" : monthEntries.some((m) => m._type === "episode" || (m._type === "movie" && m.mediaType === "tv")) ? "shows" : `movie${monthEntries.length !== 1 ? "s" : ""}`} watched${avgRating != null ? `, avg rating ${avgRating.toFixed(1)}` : ""}. Check it out on The Ratist!`}
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
            monthEntries.length === 0 ? (
              <p className="text-center text-sm text-[var(--foreground-muted)] py-8">No movies watched this month.</p>
            ) : (
              <div>
                {sortedDays.map((day) => {
                  const dayMovies = entriesByDay.get(day) ?? [];
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
                  const dayMovies = entriesByDay.get(day) ?? [];
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
              {selectedDay !== null && (entriesByDay.get(selectedDay) ?? []).length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={(e) => { if (e.target === e.currentTarget) setSelectedDay(null); }}>
                  <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 max-h-[80vh] overflow-y-auto mx-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-white">{MONTH_NAMES[calMonth]} {selectedDay}, {calYear}</h3>
                      <button onClick={() => setSelectedDay(null)} className="text-[var(--foreground-muted)] hover:text-white transition-colors text-sm">Close</button>
                    </div>
                    {renderDayRows(entriesByDay.get(selectedDay) ?? [], selectedDay, true)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ALL VIEW ── */}
          {view === "all" && (
            <div>
              {sort === "date" && allByMonth ? (
                [...allByMonth.values()].map(({ label, entries: mlist }) => (
                  <div key={label}>
                    <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/30">
                      <h3 className="text-xs font-bold text-[var(--foreground-muted)] uppercase tracking-widest">{label}</h3>
                    </div>
                    {mlist.map((m, idx) => {
                      const d = getWatchDate(m) ?? getWatchDateOrFallback(m);
                      const prev = idx > 0 ? (getWatchDate(mlist[idx - 1]) ?? getWatchDateOrFallback(mlist[idx - 1])) : null;
                      const prevDay = prev ? prev.getDate() : null;
                      const showDay = idx === 0 || (d ? d.getDate() : null) !== prevDay;
                      if (m._type === "episode") {
                        return (
                          <DiaryEpisodeRow
                            key={m.id}
                            showTmdbId={m.showTmdbId}
                            title={m.title}
                            posterPath={m.posterPath}
                            year={m.year}
                            dayNumber={showDay && d ? d.getDate() : null}
                            watchedDate={m.watchedDate}
                            seasonCount={m.seasonCount}
                            episodeCount={m.episodeCount}
                            seasons={m.seasons}
                            episodes={m.episodes}
                            ratistRating={m.ratistRating}
                            onDateChange={(newDate) => updateEpisodeGroupDate(m.showTmdbId, m.watchedDate, newDate)}
                            onEpisodeDateChange={refetchEpisodeGroups}
                          />
                        );
                      }
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
                          dayNumber={showDay && d ? d.getDate() : null}
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
                  if (m._type === "episode") {
                    return (
                      <DiaryEpisodeRow
                        key={m.id}
                        showTmdbId={m.showTmdbId}
                        title={m.title}
                        posterPath={m.posterPath}
                        year={m.year}
                        dayNumber={d ? d.getDate() : null}
                        watchedDate={m.watchedDate}
                        seasonCount={m.seasonCount}
                        episodeCount={m.episodeCount}
                        seasons={m.seasons}
                        episodes={m.episodes}
                        ratistRating={m.ratistRating}
                        onDateChange={(newDate) => updateEpisodeGroupDate(m.showTmdbId, m.watchedDate, newDate)}
                            onEpisodeDateChange={refetchEpisodeGroups}
                      />
                    );
                  }
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
                      dayNumber={d ? d.getDate() : null}
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
              {/* Undated entries at the bottom */}
              {undatedEntries.length > 0 && sort === "date" && (
                <>
                  <div style={{ position: "sticky", top: 72, zIndex: 10 }} className="bg-[var(--background)] py-2 border-b border-[var(--border)]/30 mt-4">
                    <h3 className="text-xs font-bold text-[var(--foreground-muted)] uppercase tracking-widest">No date set</h3>
                  </div>
                  {undatedEntries.map((m) => {
                    if (m._type === "episode") {
                      return (
                        <DiaryEpisodeRow
                          key={m.id}
                          showTmdbId={m.showTmdbId}
                          title={m.title}
                          posterPath={m.posterPath}
                          year={m.year}
                          dayNumber={null}
                          watchedDate={m.watchedDate}
                          seasonCount={m.seasonCount}
                          episodeCount={m.episodeCount}
                          seasons={m.seasons}
                          episodes={m.episodes}
                          ratistRating={m.ratistRating}
                          onDateChange={(newDate) => updateEpisodeGroupDate(m.showTmdbId, m.watchedDate, newDate)}
                            onEpisodeDateChange={refetchEpisodeGroups}
                        />
                      );
                    }
                    return (
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
                    );
                  })}
                </>
              )}
            </div>
          )}

          {filtered.length === 0 && entries.length > 0 && (
            <div className="text-center py-12 text-[var(--foreground-muted)]"><p>No entries match your filters.</p></div>
          )}
        </>
      )}
    </div>
  );
}
