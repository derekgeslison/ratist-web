"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Calendar, Filter, ChevronDown, ChevronUp, Sparkles, Flame, X, Loader2, ArrowRight, Users, Film, Tv, Tv2, MonitorPlay } from "lucide-react";
import type { UnifiedRelease } from "@/lib/releases";
import { STREAMING_PROVIDERS } from "@/lib/tmdb";
import { BoxOfficeShare } from "@/components/box-office/BoxOfficeShare";
import PosterOverlay from "@/components/PosterOverlay";
import { useAuth } from "@/context/AuthContext";

interface Genre {
  id: number;
  name: string;
}

interface Props {
  thisWeek: UnifiedRelease[];
  forYou: UnifiedRelease[] | null;
  /** How many genres the For You feed was matched against — drives
   *  the "matched to your top N genres" subtitle. */
  topGenresCount: number;
  initialFeed: UnifiedRelease[];
  /** Streaming launches for items that previously had a theatrical
   *  release. Surfaced in their own section below the calendar so
   *  they don't crowd the main upcoming-releases view. Empty until
   *  the snapshot cron has run for >= 2 days. */
  postTheatricalLaunches: UnifiedRelease[];
  genres: Genre[];
}

const PROVIDER_BY_ID: Map<number, { id: number; name: string; short: string; logo: string }> =
  new Map(STREAMING_PROVIDERS.map((p) => [p.id as number, { ...p }]));

const MPA_OPTIONS = ["G", "PG", "PG-13", "R", "NC-17"] as const;

const RELEASE_TYPE_OPTIONS: Array<{ value: string; label: string; types: number[] }> = [
  { value: "all",        label: "All",          types: [2, 3, 4] },
  { value: "theatrical", label: "Theatrical",   types: [2, 3] },
  { value: "digital",    label: "Digital",      types: [4] },
];

const MEDIA_TYPE_OPTIONS: Array<{ value: "movie" | "all" | "tv"; label: string }> = [
  { value: "movie", label: "Movies" },
  { value: "all",   label: "All" },
  { value: "tv",    label: "TV Shows" },
];

const DEFAULT_MEDIA_TYPE: "movie" | "all" | "tv" = "movie";

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

// Horizon dropdown is a CLIENT-SIDE display filter, not a server query
// param. The API always fetches 6 months of data; the dropdown narrows
// what's visible from that loaded dataset. Querying TMDB for only
// 30 or 90 days forced 8 pages of popularity-sort to surface niche
// content because the well-known anticipated-release pool is sparse
// at that horizon. 365 dropped — same dataset; "Look further out"
// loads the next 6-month window if the user wants more.
const HORIZON_OPTIONS: Array<{ value: string; label: string; days: number }> = [
  { value: "30",  label: "Next 30 days",   days: 30 },
  { value: "90",  label: "Next 90 days",   days: 90 },
  { value: "180", label: "Next 6 months",  days: 180 },
];

const DEFAULT_HORIZON = "180";
const FETCH_WINDOW_DAYS = 180;

interface FetchResponse {
  results: UnifiedRelease[];
  total_results: number;
  total_pages: number;
  page: number;
}

export default function ReleasesClient({ thisWeek, forYou, topGenresCount, initialFeed, postTheatricalLaunches, genres }: Props) {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // URL-synced filter state. Mirrors /box-office/all's pattern so
  // sharing a filtered release calendar gives the recipient the
  // same view.
  const [horizon, setHorizon] = useState(() => searchParams.get("horizon") ?? DEFAULT_HORIZON);
  const [region, setRegion] = useState(() => searchParams.get("region") ?? "US");
  const [releaseType, setReleaseType] = useState(() => searchParams.get("type") ?? "all");
  const [mediaType, setMediaType] = useState<"movie" | "all" | "tv">(() => {
    const m = searchParams.get("mediaType");
    return m === "all" || m === "tv" || m === "movie" ? m : DEFAULT_MEDIA_TYPE;
  });
  const [selectedGenres, setSelectedGenres] = useState<number[]>(() => {
    const g = searchParams.get("genres");
    return g ? g.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [];
  });
  const [selectedMpa, setSelectedMpa] = useState<string[]>(() => {
    const m = searchParams.get("mpa");
    return m ? m.split(",").filter(Boolean) : [];
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Server gave us the initial feed (8 pages worth); we'll re-fetch
  // as filters change. Each window load is a fixed 8-page batch —
  // there's no per-page "Load more" anymore.
  const [feed, setFeed] = useState<UnifiedRelease[]>(initialFeed);
  const [loading, setLoading] = useState(false);

  // Sliding-window pagination — instead of paging within the current
  // horizon, "Look further out" advances the date window forward by
  // `horizon` days and appends the next 8-page batch. windowOffset
  // tracks where the most-recently-loaded window starts (in days
  // from today). hasMoreFurther flips off when a fetch returns 0
  // results — TMDB's far-future data thins out around 2-3 windows
  // out, and there's no point showing the button after that.
  const [windowOffset, setWindowOffset] = useState(0);
  const [hasMoreFurther, setHasMoreFurther] = useState(true);
  const [loadingFurther, setLoadingFurther] = useState(false);

  const PAGES_PER_WINDOW = 8;

  const filterCount = selectedGenres.length + selectedMpa.length
    + (releaseType !== "all" ? 1 : 0)
    + (horizon !== DEFAULT_HORIZON ? 1 : 0)
    + (region !== "US" ? 1 : 0)
    + (mediaType !== DEFAULT_MEDIA_TYPE ? 1 : 0);

  // Two query strings:
  //   apiQuery — what we send to /api/releases. Excludes horizon
  //     because horizon is now purely a client-side display filter.
  //   shareQuery — what we put in the URL bar for sharing/back-nav.
  //     Includes horizon so a shared link preserves the visible
  //     window the sender was looking at.
  // bare=true also skips default values so the URL stays clean
  // ("/releases" instead of "/releases?horizon=180&region=US&type=all").
  function buildShareParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (horizon !== DEFAULT_HORIZON) params.set("horizon", horizon);
    if (region !== "US") params.set("region", region);
    if (releaseType !== "all") params.set("type", releaseType);
    if (mediaType !== DEFAULT_MEDIA_TYPE) params.set("mediaType", mediaType);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    return params;
  }
  function buildApiParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("region", region);
    params.set("type", releaseType);
    params.set("mediaType", mediaType);
    if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
    if (selectedMpa.length) params.set("mpa", selectedMpa.join(","));
    return params;
  }

  const apiQuery = useMemo(() => buildApiParams().toString(), [region, releaseType, mediaType, selectedGenres, selectedMpa]);
  const shareQuery = useMemo(() => buildShareParams().toString(), [horizon, region, releaseType, mediaType, selectedGenres, selectedMpa]);

  // Push to URL bar so back/forward + sharing work.
  useEffect(() => {
    const url = shareQuery ? `/releases?${shareQuery}` : "/releases";
    window.history.replaceState(null, "", url);
  }, [shareQuery]);

  // Force scroll to top on initial mount. The Suspense boundary
  // around useSearchParams in the wrapper page renders a tiny
  // fallback before the client component mounts, and the
  // browser sometimes preserves a non-zero scrollY from the
  // previous page that ends up landing the user mid-page once
  // the real content fills in. This effect runs only once;
  // back/forward navigation is handled by Next.js router and
  // doesn't re-execute the mount effect.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Re-fetch the feed whenever filters change. Initial render keeps
  // the server-provided feed so we don't double-fetch on mount.
  // Filter changes always reset the sliding window back to today.
  const isInitialLoad = useMemo(() => filterCount === 0, [filterCount]);
  useEffect(() => {
    setWindowOffset(0);
    setHasMoreFurther(true);
    if (isInitialLoad) {
      // Server-rendered initial feed is already 8 pages of months
      // 0-6, so we can use it as-is without re-fetching.
      setFeed(initialFeed);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/releases?${apiQuery}&pages=${PAGES_PER_WINDOW}&windowOffset=0`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: FetchResponse) => {
        if (!cancelled) {
          setFeed(data.results ?? []);
        }
      })
      .catch(() => { if (!cancelled) setFeed([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiQuery, isInitialLoad, initialFeed]);

  async function lookFurtherOut() {
    if (loadingFurther) return;
    // Always advance by the fetch window (6 months) regardless of the
    // display horizon. Window size and display narrowness are now
    // independent concepts — the user filters via the dropdown,
    // and "Look further out" loads the next batch of well-known
    // catalog from the API.
    const nextOffset = windowOffset + FETCH_WINDOW_DAYS;
    setLoadingFurther(true);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set("pages", String(PAGES_PER_WINDOW));
      params.set("windowOffset", String(nextOffset));
      const res = await fetch(`/api/releases?${params.toString()}`);
      if (!res.ok) return;
      const data: FetchResponse = await res.json();
      const incoming = data.results ?? [];
      if (incoming.length === 0) {
        // Hit the end of TMDB's far-future data.
        setHasMoreFurther(false);
        return;
      }
      setFeed((prev) => {
        // Dedup against what's already shown — adjacent windows can
        // overlap on films with primary_release_date exactly on the
        // boundary, and TMDB occasionally double-lists across pages.
        const existing = new Set(prev.map((m) => m.id));
        const additions = incoming.filter((m) => !existing.has(m.id));
        return [...prev, ...additions];
      });
      setWindowOffset(nextOffset);
    } finally {
      setLoadingFurther(false);
    }
  }

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
    setHorizon(DEFAULT_HORIZON);
    setRegion("US");
    setReleaseType("all");
    setMediaType(DEFAULT_MEDIA_TYPE);
    setSelectedGenres([]);
    setSelectedMpa([]);
  }

  // Date grouping for the main feed. TMDB returns release_date per
  // movie — group by that. Within a date, popularity-sorted order
  // is preserved from the API. Skip movies without a release_date
  // (rare for upcoming, but possible for premiere-only entries).
  //
  // Horizon is applied here as a client-side cutoff, NOT in the API
  // call. The API always returns a 6-month window (or more, after
  // "Look further out" clicks); this filter narrows display to
  // today + horizon days. Streaming-launch entries dated to recent
  // past pass naturally since their dates are <= cutoff.
  const grouped = useMemo(() => {
    const horizonDays = HORIZON_OPTIONS.find((h) => h.value === horizon)?.days ?? FETCH_WINDOW_DAYS;
    const cutoff = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const map = new Map<string, UnifiedRelease[]>();
    for (const m of feed) {
      const date = m.release_date;
      if (!date) continue;
      if (date > cutoff) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(m);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [feed, horizon]);

  const displayedCount = useMemo(
    () => grouped.reduce((sum, [, items]) => sum + items.length, 0),
    [grouped],
  );

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
        <section className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">This Week in Theaters</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {thisWeek.map((m) => (
              <ReleaseCard key={`${m.mediaType}-${m.id}`} item={m} accent />
            ))}
          </div>
        </section>
      )}

      {/* Anticipating link — sits below the This Week tiles and
          above the filter bar so signed-in users see the social
          discovery prompt at the natural transition point in the
          page flow. Anonymous users see nothing here. */}
      {user && (
        <div className="mb-6 text-center">
          <Link
            href="/for-you#anticipated"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            See what people you follow are anticipating
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* For You — personalized to top genres. Only shows if we
          have a real profile to anchor against. */}
      {forYou && forYou.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">For You</h2>
            <span className="text-xs text-[var(--foreground-muted)]">
              · matched to your top {topGenresCount} genre{topGenresCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-0 sm:px-0">
            {forYou.map((m) => (
              <div key={`${m.mediaType}-${m.id}`} className="shrink-0 w-32 sm:w-36">
                <ReleaseCard item={m} />
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
          {/* Quick toggles in the always-visible row: media type,
              time horizon, and release type are the most-changed
              filters, so they live outside the collapse for one-tap
              access. Media type is first because it gates which
              fields below are even meaningful (release_type and MPA
              cert are movie-specific). */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-[var(--background)] border border-[var(--border)] rounded-md p-0.5" role="group" aria-label="Media type">
              {MEDIA_TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setMediaType(t.value)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${
                    mediaType === t.value
                      ? "bg-[var(--ratist-red)] text-white"
                      : "text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {t.value === "movie" && <Film className="w-3 h-3" />}
                  {t.value === "tv" && <Tv2 className="w-3 h-3" />}
                  {t.label}
                </button>
              ))}
            </div>
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
            {/* Release type and region/MPA only apply to movies — TMDB
                /discover/tv has no equivalent filters. Hide them in
                TV-only mode so users don't fiddle with controls that
                do nothing. */}
            {mediaType !== "tv" && (
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
            )}
          </div>
        </div>

        {filtersOpen && (
          <div className="space-y-4 pt-2 border-t border-[var(--border)]">
            {/* Region — movies-only. TMDB /discover/tv has no region
                or certification filter; TV releases are network-
                global from a discover-API perspective. */}
            {mediaType !== "tv" && (
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
            )}

            {/* MPA pills — movies-only for the same reason. */}
            {mediaType !== "tv" && (
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
            )}

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
          : displayedCount === 0
            ? "No upcoming releases match these filters."
            : `${displayedCount} upcoming release${displayedCount === 1 ? "" : "s"}`}
      </p>

      <div className="space-y-6">
        {grouped.map(([date, movies]) => (
          <DateGroup key={date} date={date} movies={movies} />
        ))}
      </div>

      {/* Coming to streaming — items that already had a theatrical
            run and have just landed on a streaming service. Distinct
            from the main feed (which is true upcoming releases +
            streaming-first launches). Empty section is hidden so
            it doesn't render an awkward stub before the cron has
            data. mediaType filter applies — when user selects TV,
            this section shows only show launches; movies-only mode
            shows only movie launches. */}
      {postTheatricalLaunches.length > 0 && (() => {
        const filtered = mediaType === "tv"
          ? postTheatricalLaunches.filter((l) => l.mediaType === "tv")
          : mediaType === "movie"
            ? postTheatricalLaunches.filter((l) => l.mediaType === "movie")
            : postTheatricalLaunches;
        if (filtered.length === 0) return null;
        return (
          <section className="mt-12 pt-8 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 mb-3">
              <MonitorPlay className="w-4 h-4 text-[var(--ratist-red)]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Coming to Streaming</h2>
              <span className="text-xs text-[var(--foreground-muted)]">
                · films that recently landed on streaming after their theatrical run
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((item) => (
                <ReleaseCard key={`launch-${item.mediaType}-${item.id}-${item.streamingProviderId}`} item={item} />
              ))}
            </div>
          </section>
        );
      })()}

      {/* Sliding-window pagination. Each click of "Look further out"
            advances the date range forward by 6 months and appends
            the next 8-page batch to the feed. Hidden when:
            - User has narrowed the display horizon (30/90 days):
              loading more 6-month batches would just be hidden by
              the client-side cutoff filter and confuse the user.
              They should widen the horizon first.
            - A prior fetch returned 0 results (TMDB's far-future
              data runs out around 2-3 windows ahead). */}
      {feed.length > 0 && hasMoreFurther && !loading && horizon === DEFAULT_HORIZON && (
        <div className="mt-8 text-center">
          <button
            onClick={lookFurtherOut}
            disabled={loadingFurther}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {loadingFurther ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </>
            ) : (
              <>
                Look further out
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
      {feed.length > 0 && !hasMoreFurther && (
        <p className="mt-8 text-center text-xs text-[var(--foreground-muted)]">
          You've reached the end of available upcoming releases.
        </p>
      )}

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

function DateGroup({ date, movies: items }: { date: string; movies: UnifiedRelease[] }) {
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
        {items.map((m) => (
          <ReleaseCard key={`${m.mediaType}-${m.id}`} item={m} />
        ))}
      </div>
    </section>
  );
}

function ReleaseCard({ item, accent }: { item: UnifiedRelease; accent?: boolean }) {
  const href = item.mediaType === "tv" ? `/shows/${item.id}` : `/movies/${item.id}`;
  return (
    <Link
      href={href}
      className={`group block bg-[var(--surface)] border rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors ${
        accent ? "border-[var(--ratist-red)]/30" : "border-[var(--border)]"
      }`}
    >
      <PosterOverlay
        tmdbId={item.id}
        title={item.title}
        posterPath={item.poster_path}
        releaseDate={item.release_date}
        voteAverage={item.vote_average}
        mediaType={item.mediaType}
        watchlistOnly
      >
      <div className="relative aspect-[2/3] bg-[var(--background)]">
        <Image
          src={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : "/placeholder-poster.svg"}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className="object-cover"
        />
        {item.mediaType === "tv" && !item.streamingProviderId && (
          <div className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
            <Tv className="w-2.5 h-2.5" />
            <span className="text-[8px] font-bold leading-none">TV</span>
          </div>
        )}
        {item.streamingProviderId != null && (() => {
          const provider = PROVIDER_BY_ID.get(item.streamingProviderId);
          return (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-black/80 border border-[var(--ratist-red)]/70 text-white">
              <MonitorPlay className="w-2.5 h-2.5 text-[var(--ratist-red)]" />
              New on {provider?.short ?? "streaming"}
            </span>
          );
        })()}
      </div>
      </PosterOverlay>
      <div className="p-2">
        <p className="text-xs font-semibold text-white truncate group-hover:text-[var(--ratist-red)]">
          {item.title}
        </p>
        {item.release_date && (
          <p className="text-[10px] text-[var(--foreground-muted)]">{item.release_date}</p>
        )}
      </div>
    </Link>
  );
}
