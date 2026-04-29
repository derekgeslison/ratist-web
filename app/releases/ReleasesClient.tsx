"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Calendar, Filter, ChevronDown, ChevronUp, Sparkles, Flame, X, Loader2, ArrowRight } from "lucide-react";
import type { TMDBMovie } from "@/lib/tmdb";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";

interface Genre {
  id: number;
  name: string;
}

interface Props {
  thisWeek: TMDBMovie[];
  forYou: TMDBMovie[] | null;
  topGenres: number[];
  initialFeed: TMDBMovie[];
  genres: Genre[];
}

const MPA_OPTIONS = ["G", "PG", "PG-13", "R", "NC-17"] as const;

const RELEASE_TYPE_OPTIONS: Array<{ value: string; label: string; types: number[] }> = [
  { value: "all",        label: "All",          types: [2, 3, 4] },
  { value: "theatrical", label: "Theatrical",   types: [2, 3] },
  { value: "digital",    label: "Digital",      types: [4] },
];

// Common regions — small list keeps the dropdown short. Users in
// other markets can extend later via filter param.
const REGION_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
];

const HORIZON_OPTIONS: Array<{ value: string; label: string; days: number }> = [
  { value: "30",  label: "Next 30 days",  days: 30 },
  { value: "90",  label: "Next 90 days",  days: 90 },
  { value: "180", label: "Next 6 months", days: 180 },
];

interface FetchResponse {
  results: TMDBMovie[];
  total_results: number;
}

export default function ReleasesClient({ thisWeek, forYou, topGenres, initialFeed, genres }: Props) {
  const searchParams = useSearchParams();

  // URL-synced filter state. Mirrors /box-office/all's pattern so
  // sharing a filtered release calendar gives the recipient the
  // same view.
  const [horizon, setHorizon] = useState(() => searchParams.get("horizon") ?? "90");
  const [region, setRegion] = useState(() => searchParams.get("region") ?? "US");
  const [releaseType, setReleaseType] = useState(() => searchParams.get("type") ?? "all");
  const [selectedGenres, setSelectedGenres] = useState<number[]>(() => {
    const g = searchParams.get("genres");
    return g ? g.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [];
  });
  const [selectedMpa, setSelectedMpa] = useState<string[]>(() => {
    const m = searchParams.get("mpa");
    return m ? m.split(",").filter(Boolean) : [];
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Server gave us the initial feed; we'll re-fetch as filters change.
  const [feed, setFeed] = useState<TMDBMovie[]>(initialFeed);
  const [loading, setLoading] = useState(false);

  const filterCount = selectedGenres.length + selectedMpa.length
    + (releaseType !== "all" ? 1 : 0)
    + (horizon !== "90" ? 1 : 0)
    + (region !== "US" ? 1 : 0);

  // Build the query string used both for the API call and the
  // shareable URL. `bare` excludes default values so the URL stays
  // short when the user hasn't tweaked anything.
  function buildParams(bare: boolean): URLSearchParams {
    const params = new URLSearchParams();
    if (!bare || horizon !== "90") params.set("horizon", horizon);
    if (!bare || region !== "US") params.set("region", region);
    if (!bare || releaseType !== "all") params.set("type", releaseType);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    return params;
  }

  const apiQuery = useMemo(() => buildParams(false).toString(), [horizon, region, releaseType, selectedGenres, selectedMpa]);
  const shareQuery = useMemo(() => buildParams(true).toString(), [horizon, region, releaseType, selectedGenres, selectedMpa]);

  // Push to URL bar so back/forward + sharing work.
  useEffect(() => {
    const url = shareQuery ? `/releases?${shareQuery}` : "/releases";
    window.history.replaceState(null, "", url);
  }, [shareQuery]);

  // Re-fetch the feed whenever filters change. Initial render keeps
  // the server-provided feed so we don't double-fetch on mount.
  const isInitialLoad = useMemo(() => filterCount === 0, [filterCount]);
  useEffect(() => {
    if (isInitialLoad) {
      setFeed(initialFeed);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/releases?${apiQuery}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: FetchResponse) => {
        if (!cancelled) setFeed(data.results ?? []);
      })
      .catch(() => { if (!cancelled) setFeed([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiQuery, isInitialLoad, initialFeed]);

  function toggleGenre(id: number) {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }
  function toggleMpa(code: string) {
    setSelectedMpa((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code],
    );
  }
  function clearAll() {
    setHorizon("90");
    setRegion("US");
    setReleaseType("all");
    setSelectedGenres([]);
    setSelectedMpa([]);
  }

  // Date grouping for the main feed. TMDB returns release_date per
  // movie — group by that. Within a date, popularity-sorted order
  // is preserved from the API. Skip movies without a release_date
  // (rare for upcoming, but possible for premiere-only entries).
  const grouped = useMemo(() => {
    const map = new Map<string, TMDBMovie[]>();
    for (const m of feed) {
      const date = m.release_date;
      if (!date) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [feed]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-6 h-6 text-[var(--ratist-red)]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Release Calendar</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Upcoming theatrical and digital releases — personalized when signed in.
            {" "}
            <Link href="/movies" className="text-[var(--ratist-red)] hover:underline">
              Browse all movies →
            </Link>
          </p>
        </div>
        <BoxOfficeShare
          path={shareQuery ? `/releases?${shareQuery}` : "/releases"}
          ogPath="/api/og/releases"
          shareText="Coming Soon — The Ratist Release Calendar"
        />
      </div>

      {/* This Week hero — top 5 most anticipated theatrical
          releases dropping in the next 7 days. */}
      {thisWeek.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">This Week in Theaters</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {thisWeek.map((m) => (
              <ReleaseCard key={m.id} movie={m} accent />
            ))}
          </div>
        </section>
      )}

      {/* For You — personalized to top genres. Only shows if we
          have a real profile to anchor against. */}
      {forYou && forYou.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">For You</h2>
            <span className="text-xs text-[var(--foreground-muted)]">
              · matched to your top {topGenres.length} genres
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-0 sm:px-0">
            {forYou.map((m) => (
              <div key={m.id} className="shrink-0 w-32 sm:w-36">
                <ReleaseCard movie={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors"
            aria-expanded={filtersOpen}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums">
                {filterCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {filterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-[var(--foreground-muted)] hover:text-white inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          {/* Quick toggles in the always-visible row: time horizon
              and release type are the two most-changed filters, so
              they live outside the collapse for one-tap access. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
              aria-label="Time horizon"
            >
              {HORIZON_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            <div className="inline-flex bg-[var(--background)] border border-[var(--border)] rounded-md p-0.5">
              {RELEASE_TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setReleaseType(t.value)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    releaseType === t.value
                      ? "bg-[var(--ratist-red)] text-white"
                      : "text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div className="space-y-4 pt-2 border-t border-[var(--border)]">
            {/* Region */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--foreground-muted)] mr-1">Region:</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* MPA pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--foreground-muted)] mr-1">MPA:</span>
              {MPA_OPTIONS.map((code) => {
                const active = selectedMpa.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleMpa(code)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      active
                        ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                        : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/40"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>

            {/* Genre chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--foreground-muted)] mr-1">Genre:</span>
              {genres.map((g) => {
                const active = selectedGenres.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGenre(g.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      active
                        ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                        : "bg-[var(--background)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/40"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Date-grouped list */}
      <p className="text-xs text-[var(--foreground-muted)] mb-3">
        {loading
          ? "Loading…"
          : feed.length === 0
            ? "No upcoming releases match these filters."
            : `${feed.length} upcoming release${feed.length === 1 ? "" : "s"}`}
      </p>

      <div className="space-y-6">
        {grouped.map(([date, movies]) => (
          <DateGroup key={date} date={date} movies={movies} />
        ))}
      </div>

      {/* Footer link back to /movies */}
      <div className="mt-12 text-center">
        <Link
          href="/movies"
          className="inline-flex items-center gap-2 px-5 py-3 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-sm font-semibold text-white rounded-lg transition-colors"
        >
          Browse all movies <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function DateGroup({ date, movies }: { date: string; movies: TMDBMovie[] }) {
  // Format date as "Friday, May 2" with year only when not current.
  // The user is scanning the calendar — knowing the day-of-week is
  // more useful than the year for releases in the next few months.
  const d = new Date(date + "T12:00:00");
  const now = new Date();
  const isCurrentYear = d.getFullYear() === now.getFullYear();
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: isCurrentYear ? undefined : "numeric",
    timeZone: "UTC",
  });

  // Days-from-now helper — the relative "in 3 days" / "next week"
  // text below the formal date is genuinely useful for fast scanning.
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((d.getTime() - now.getTime()) / dayMs);
  let relative = "";
  if (diffDays === 0) relative = "Today";
  else if (diffDays === 1) relative = "Tomorrow";
  else if (diffDays > 1 && diffDays < 7) relative = `In ${diffDays} days`;
  else if (diffDays >= 7 && diffDays < 14) relative = "Next week";
  else if (diffDays >= 14 && diffDays < 21) relative = "In 2 weeks";

  return (
    <section>
      <header className="mb-3 flex items-baseline gap-3">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        {relative && <span className="text-xs text-[var(--foreground-muted)]">{relative}</span>}
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {movies.map((m) => (
          <ReleaseCard key={m.id} movie={m} />
        ))}
      </div>
    </section>
  );
}

function ReleaseCard({ movie, accent }: { movie: TMDBMovie; accent?: boolean }) {
  return (
    <Link
      href={`/movies/${movie.id}`}
      className={`group block bg-[var(--surface)] border rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors ${
        accent ? "border-[var(--ratist-red)]/30" : "border-[var(--border)]"
      }`}
    >
      <div className="relative aspect-[2/3] bg-[var(--background)]">
        {movie.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
            alt={movie.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">
            No poster
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-white truncate group-hover:text-[var(--ratist-red)]">
          {movie.title}
        </p>
        {movie.release_date && (
          <p className="text-[10px] text-[var(--foreground-muted)]">{movie.release_date}</p>
        )}
      </div>
    </Link>
  );
}
