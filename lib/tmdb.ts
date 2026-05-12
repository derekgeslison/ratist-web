const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
export const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB error ${res.status}: ${path}`);
  return res.json();
}

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime?: number;
  popularity: number;
  vote_average: number;
  vote_count: number;
  tagline?: string;
  budget?: number;
  revenue?: number;
  status?: string;
  original_language?: string;
  genres?: { id: number; name: string }[];
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null;
  production_companies?: { id: number; name: string; logo_path: string | null; origin_country: string }[];
  videos?: { results: TMDBVideo[] };
  credits?: { cast: TMDBCastMember[]; crew: TMDBCrewMember[] };
  release_dates?: { results: TMDBReleaseDateResult[] };
  images?: { backdrops: TMDBImage[]; posters: TMDBImage[] };
  imdb_id?: string;
}

export interface TMDBCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    release_date: string;
    vote_average: number;
  }[];
}

export interface TMDBVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
  known_for_department: string;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  profile_path: string | null;
  job: string;
  department: string;
  known_for_department: string;
}

export interface TMDBImage {
  file_path: string;
  width: number;
  height: number;
  vote_average: number;
}

export interface TMDBWatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TMDBReleaseDateResult {
  iso_3166_1: string;
  release_dates: { certification: string; type: number }[];
}

export interface TMDBPageResult<T> {
  results: T[];
  page: number;
  total_pages: number;
  total_results: number;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

/**
 * Sentinel value stamped onto `poster_path` by safeguardTMDBMovies /
 * safeguardTMDBShows (and detail-page masks) when an admin / the
 * Vision auto-scan has flagged the poster as containing explicit
 * content. posterUrl recognizes the sentinel and routes the render
 * to /poster-blocked.svg instead of the generic missing-poster
 * placeholder. Stays a plain string so the existing prop typings
 * (`string | null`) on every component continue to work unchanged.
 */
export const POSTER_BLOCKED_SENTINEL = "__BLOCKED__";

export function posterUrl(path: string | null, size = "w500"): string {
  if (path === POSTER_BLOCKED_SENTINEL) return "/poster-blocked.svg";
  if (!path) return "/placeholder-poster.svg";
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function backdropUrl(path: string | null, size = "w1280"): string {
  if (!path) return "/placeholder-backdrop.svg";
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

function isAccessibilityVideo(v: TMDBVideo): boolean {
  const name = (v.name ?? "").toLowerCase();
  return name.includes("audio desc") || name.includes("descriptive audio")
    || name.includes("visually impaired") || name.includes("audio commentary")
    || name.includes("sign language") || name.includes("closed caption");
}

export function getTrailerKey(movie: TMDBMovie): string | null {
  const videos = (movie.videos?.results ?? []).filter((v) => !isAccessibilityVideo(v));
  const trailer = videos.find(
    (v) => v.type === "Trailer" && v.site === "YouTube" && v.official
  ) ?? videos.find((v) => v.type === "Trailer" && v.site === "YouTube");
  return trailer?.key ?? null;
}

export function getMpaaRating(movie: TMDBMovie): string | null {
  const usRelease = movie.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
  if (!usRelease) return null;
  const rated = usRelease.release_dates.find((d) => d.certification && d.type === 3)
    ?? usRelease.release_dates.find((d) => d.certification);
  return rated?.certification ?? null;
}

// API functions
export async function getPopularMovies(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/movie/popular", { page: String(page) });
}

export async function getTrendingMovies(timeWindow: "day" | "week" = "week") {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>(`/trending/movie/${timeWindow}`);
}

export async function getTrendingShows(timeWindow: "day" | "week" = "week") {
  return tmdbFetch<TMDBPageResult<TMDBShow>>(`/trending/tv/${timeWindow}`);
}

export async function getTopRatedMovies(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/movie/top_rated", { page: String(page) });
}

// How many days back from today we consider "now playing". US theatrical
// runs are typically 30-90 days; 60 days is the sweet spot — old enough
// to catch lingering wide releases, fresh enough to cut anniversary
// re-releases (e.g., Fight Club showing up because TMDB has a recent
// re-release date entry).
const NOW_PLAYING_WINDOW_DAYS = 60;

// How many pages of /movie/now_playing to combine when sorting. The
// endpoint returns ~20 per page in TMDB's own curated order. Sorting
// within one page only sorts those 20, so to get globally-correct
// newest-first ordering we have to fetch a buffer of pages first. 5
// pages = ~100 films, plenty to cover a 60-day theatrical window.
const NOW_PLAYING_PAGES = 5;

// TMDB popularity floor for the "Now Playing" rail. Films with mainstream
// theatrical distribution always score >10 within a week of release;
// micro-indies and self-published direct-to-streaming films classified
// as "theatrical" by TMDB sit around 0.1-2. Without this floor, sorting
// by newest puts yesterday's BatFreak Part II / OFFICE JOB / Lovebug
// ahead of last week's wide releases. 5 is conservative — keeps
// mid-tier indies that have any traction, kills the no-name spam.
const NOW_PLAYING_MIN_POPULARITY = 5;

/** Strip out items that don't actually belong in a "now playing" view:
 *  no release date, future-dated (TMDB sometimes pre-lists upcoming
 *  films inside now_playing), older than the theatrical window
 *  (catches re-releases), or below the popularity floor (catches
 *  micro-indie / self-release noise). */
function filterNowPlayingResults(items: TMDBMovie[], today: string, windowStart: string): TMDBMovie[] {
  return items.filter((m) => {
    if (!m.release_date) return false;
    if (m.release_date > today) return false;
    if (m.release_date < windowStart) return false;
    if ((m.popularity ?? 0) < NOW_PLAYING_MIN_POPULARITY) return false;
    return true;
  });
}

/** Aggregate two complementary TMDB sources into a single deduped +
 *  filtered + sorted-by-release-date-desc pool of currently-playing
 *  films:
 *
 *   1. /movie/now_playing — TMDB's curated "what's in theaters now"
 *      list. Strong on big-name wide releases, weaker on freshly-
 *      released films TMDB hasn't yet promoted into the curated set.
 *
 *   2. /discover/movie with strict params (US region, theatrical-only
 *      release type, last 60 days, English-language primary). Catches
 *      legit US theatrical releases that haven't bubbled into curated
 *      yet. Restricting to original_language=en keeps the noise down
 *      from international films TMDB happens to date-stamp as US.
 *
 *  Both calls are 1-hour cached at the tmdbFetch layer, so the
 *  effective cost is one fetch every hour per call site.
 */
async function loadNowPlayingPool(): Promise<TMDBMovie[]> {
  const today = new Date().toISOString().split("T")[0];
  const windowStart = new Date(Date.now() - NOW_PLAYING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const nowPlayingPages = Promise.all(
    Array.from({ length: NOW_PLAYING_PAGES }, (_, i) => i + 1).map((p) =>
      tmdbFetch<TMDBPageResult<TMDBMovie>>("/movie/now_playing", {
        page: String(p),
        region: "US",
        language: "en-US",
      }).catch(() => null),
    ),
  );

  const discoverPages = Promise.all(
    Array.from({ length: 2 }, (_, i) => i + 1).map((p) =>
      tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", {
        page: String(p),
        region: "US",
        with_release_type: "3",
        "primary_release_date.gte": windowStart,
        "primary_release_date.lte": today,
        // Sort by popularity rather than release_date so the discover
        // supplement leans toward films with audience traction. Date is
        // already enforced by primary_release_date.gte; we just don't
        // want to use date-desc here because that prioritizes today's
        // micro-indie self-releases over a 5-day-old wide release.
        sort_by: "popularity.desc",
        with_original_language: "en",
        // vote_count floor of 5 hides films with literally no audience
        // signal. Mainstream releases exceed this within ~24h; indie
        // self-releases usually sit at 0-2 forever.
        "vote_count.gte": "5",
      }).catch(() => null),
    ),
  );

  const [npResults, discoverResults] = await Promise.all([nowPlayingPages, discoverPages]);
  const seen = new Set<number>();
  const merged: TMDBMovie[] = [];
  for (const data of [...npResults, ...discoverResults]) {
    if (!data) continue;
    for (const m of data.results) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
  }
  return filterNowPlayingResults(merged, today, windowStart)
    .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
}

export async function getNowPlayingMovies(page = 1) {
  // Home rail wants newest-first across the full theatrical window
  // (not just within page 1 of TMDB's curated order — that ordering is
  // popularity-weighted and pushes month-old hits ahead of fresh
  // releases). We aggregate, filter, sort, then page-slice.
  const pool = await loadNowPlayingPool();
  const PAGE_SIZE = 20;
  const start = (page - 1) * PAGE_SIZE;
  const slice = pool.slice(start, start + PAGE_SIZE);
  return {
    page,
    results: slice,
    total_results: pool.length,
    total_pages: Math.max(1, Math.ceil(pool.length / PAGE_SIZE)),
  };
}

export async function getUpcomingMovies(page = 1) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", {
    page: String(page),
    sort_by: "popularity.desc",
    "primary_release_date.gte": tomorrow,
    "primary_release_date.lte": sixMonths,
    with_release_type: "2|3",
    region: "US",
  });
}

export async function getMovieDetails(tmdbId: number): Promise<TMDBMovie> {
  return tmdbFetch<TMDBMovie>(`/movie/${tmdbId}`, {
    append_to_response: "videos,credits,release_dates,images",
  });
}

export async function getWatchProviders(tmdbId: number) {
  const data = await tmdbFetch<{ results: Record<string, { flatrate?: TMDBWatchProvider[]; rent?: TMDBWatchProvider[]; buy?: TMDBWatchProvider[] }> }>(`/movie/${tmdbId}/watch/providers`);
  return data.results?.US ?? null;
}

export async function getMovieRecommendations(tmdbId: number) {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>(`/movie/${tmdbId}/recommendations`);
}

export async function getCollectionDetails(collectionId: number): Promise<TMDBCollection> {
  return tmdbFetch<TMDBCollection>(`/collection/${collectionId}`);
}

export async function searchMovies(query: string, page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/search/movie", {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function getMoviesByGenre(genreId: number, page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", {
    with_genres: String(genreId),
    page: String(page),
    sort_by: "popularity.desc",
  });
}

const SORT_MAP: Record<string, string> = {
  popular: "popularity.desc",
  top_rated: "vote_average.desc",
  newest: "release_date.desc",
  oldest: "release_date.asc",
  title_az: "title.asc",
  title_za: "title.desc",
};

export const MPAA_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];

export const STREAMING_PROVIDERS = [
  { id: 8, name: "Netflix", short: "Netflix", logo: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg" },
  { id: 9, name: "Amazon Prime Video", short: "Prime", logo: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg" },
  { id: 337, name: "Disney Plus", short: "Disney+", logo: "/97yvRBw1GzX7fXprcF80er19ot.jpg" },
  { id: 15, name: "Hulu", short: "Hulu", logo: "/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg" },
  { id: 1899, name: "HBO Max", short: "Max", logo: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg" },
  { id: 350, name: "Apple TV", short: "Apple TV+", logo: "/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg" },
  { id: 386, name: "Peacock Premium", short: "Peacock", logo: "/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg" },
  { id: 2303, name: "Paramount Plus Premium", short: "Paramount+", logo: "/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg" },
] as const;


export async function discoverMovies(options: {
  query?: string;
  genres?: string[];
  excludeGenres?: string[];
  genreMode?: "any" | "all";
  castIds?: string[];
  sort?: string;
  yearFrom?: string;
  yearTo?: string;
  certifications?: string[];
  ratingGte?: string;
  ratingLte?: string;
  providers?: string[];
  /** TMDB production company IDs (e.g. ["41077", "90733"] for A24/Neon).
   *  Pipe-joined → OR semantics: returns titles from any of them. */
  companies?: string[];
  language?: string;
  keywords?: string;
  /** Pipe-joined TMDB keyword IDs to EXCLUDE (without_keywords). Comma vs
   *  pipe doesn't matter for exclusion since TMDB ORs them either way — pipe
   *  used for parity with `keywords`. */
  excludeKeywords?: string;
  releaseStatus?: string;
  minRuntime?: number;
  maxRuntime?: number;
  page?: number;
  // legacy
  genre?: string;
  minRating?: string;
}) {
  // Now-playing routes through TMDB's curated /movie/now_playing endpoint
  // rather than /discover/movie. The discover endpoint with region=US +
  // with_release_type=2|3 returns a global mix because `region` only
  // selects which region's date is checked — international films with a
  // qualifying theatrical date in the window still qualify, which is
  // why fresh US releases (Michael, etc.) were ranked behind older
  // foreign films. /movie/now_playing is the canonical "what's in US
  // theaters right now" answer.
  //
  // We aggregate the first NOW_PLAYING_PAGES of the endpoint, filter
  // (drop future-dated and >60-day-old films), sort by the user's
  // chosen sort, then page-slice. Aggregation is required for
  // newest-first to be globally correct — without it, sorting within
  // a single TMDB page would only rearrange those 20 items, leaving
  // page 2's contents in TMDB's popularity order.
  if (options.releaseStatus === "now_playing") {
    const pool = await loadNowPlayingPool();
    const sortKey = options.sort ?? "newest";
    const sorted = [...pool].sort((a, b) => {
      switch (sortKey) {
        case "newest":  return (b.release_date ?? "").localeCompare(a.release_date ?? "");
        case "oldest":  return (a.release_date ?? "").localeCompare(b.release_date ?? "");
        case "title_az": return (a.title ?? "").localeCompare(b.title ?? "");
        case "title_za": return (b.title ?? "").localeCompare(a.title ?? "");
        case "top_rated": return (b.vote_average ?? 0) - (a.vote_average ?? 0);
        case "popular":
        default: return (b.popularity ?? 0) - (a.popularity ?? 0);
      }
    });
    const PAGE_SIZE = 20;
    const page = options.page ?? 1;
    const start = (page - 1) * PAGE_SIZE;
    return {
      page,
      results: sorted.slice(start, start + PAGE_SIZE),
      total_results: sorted.length,
      total_pages: Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)),
    };
  }

  const sortBy = SORT_MAP[options.sort ?? "popular"] ?? "popularity.desc";
  const isUpcoming = options.releaseStatus === "upcoming";
  const params: Record<string, string> = {
    page: String(options.page ?? 1),
    sort_by: sortBy,
    // Upcoming opens up to vote_count=0 (unreleased films have no votes
    // yet). Top-rated keeps a 200-vote floor so a single rating doesn't
    // catapult an obscure film. Everything else uses the standard 10
    // floor as a quality filter.
    "vote_count.gte": isUpcoming ? "0" : options.sort === "top_rated" ? "200" : "10",
  };
  if (options.query) params.with_text_query = options.query;

  const genreIds = options.genres?.length ? options.genres : (options.genre ? [options.genre] : []);
  if (genreIds.length > 0) {
    params.with_genres = genreIds.join(options.genreMode === "all" ? "," : "|");
  }
  if (options.excludeGenres?.length) params.without_genres = options.excludeGenres.join(",");
  if (options.castIds?.length) params.with_cast = options.castIds.join(",");

  // Theater status constrains date range and release type
  if (options.releaseStatus === "now_playing") {
    const today = new Date().toISOString().split("T")[0];
    const daysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    params["primary_release_date.gte"] = daysAgo;
    params["primary_release_date.lte"] = today;
    params.with_release_type = "2|3";
    params.region = "US";
  } else if (isUpcoming) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    params["primary_release_date.gte"] = tomorrow;
    params["primary_release_date.lte"] = sixMonths;
    params.with_release_type = "2|3";
    params.region = "US";
  } else {
    if (options.yearFrom) params["primary_release_date.gte"] = `${options.yearFrom}-01-01`;
    if (options.yearTo) params["primary_release_date.lte"] = `${options.yearTo}-12-31`;
  }

  if (options.ratingGte) params["vote_average.gte"] = options.ratingGte;
  else if (options.minRating) params["vote_average.gte"] = options.minRating;
  if (options.ratingLte) params["vote_average.lte"] = options.ratingLte;
  if (options.certifications?.length) {
    params.certification_country = "US";
    params.certification = options.certifications.join("|");
  }
  if (options.providers?.length) {
    params.with_watch_providers = options.providers.join("|");
    params.watch_region = "US";
  }
  if (options.language) params.with_original_language = options.language;
  if (options.keywords) params.with_keywords = options.keywords;
  // Normalize comma → pipe so callers writing CSV in URLs get OR semantics
  // (exclude any title tagged with any of these). TMDB treats comma as AND
  // for without_keywords ("exclude only when all match"), which is rarely
  // what users mean by "I don't want X or Y".
  if (options.excludeKeywords) params.without_keywords = options.excludeKeywords.replace(/,/g, "|");
  if (options.companies && options.companies.length > 0) {
    // `|` for OR — picking A24 + Neon means "from either," not "joint productions."
    params.with_companies = options.companies.join("|");
  }
  if (options.minRuntime != null) params["with_runtime.gte"] = String(options.minRuntime);
  if (options.maxRuntime != null) params["with_runtime.lte"] = String(options.maxRuntime);

  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", params);
}

// In-memory genre cache (survives across requests within the same server instance)
let _movieGenreCache: { genres: TMDBGenre[]; ts: number } | null = null;
let _tvGenreCache: { genres: TMDBGenre[]; ts: number } | null = null;
const GENRE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getGenres() {
  if (_movieGenreCache && Date.now() - _movieGenreCache.ts < GENRE_CACHE_TTL) {
    return { genres: _movieGenreCache.genres };
  }
  const data = await tmdbFetch<{ genres: TMDBGenre[] }>("/genre/movie/list");
  _movieGenreCache = { genres: data.genres, ts: Date.now() };
  return data;
}

// ─── TV Shows ─────────────────────────────────────────────────────────────────

export interface TMDBShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date?: string;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  tagline?: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language?: string;
  genres?: { id: number; name: string }[];
  networks?: { id: number; name: string; logo_path: string | null }[];
  production_companies?: { id: number; name: string; logo_path: string | null; origin_country: string }[];
  created_by?: { id: number; name: string; profile_path: string | null }[];
  seasons?: TMDBSeason[];
  videos?: { results: TMDBVideo[] };
  aggregate_credits?: { cast: TMDBShowCastMember[]; crew: TMDBShowCrewMember[] };
  content_ratings?: { results: TMDBContentRating[] };
  images?: { backdrops: TMDBImage[]; posters: TMDBImage[] };
  external_ids?: { imdb_id?: string };
  // The pair below drives the "currently airing" banner + per-season
  // badge. next_episode_to_air is null for shows that have aired their
  // last announced episode (Ended/Canceled, or on hiatus with no
  // upcoming episodes scheduled in TMDB yet); when present, the show
  // is treated as actively airing and its next-episode metadata is
  // surfaced on the show page.
  next_episode_to_air?: {
    id: number;
    name: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
    overview: string;
    runtime: number | null;
  } | null;
  last_episode_to_air?: {
    id: number;
    name: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
    overview: string;
    runtime: number | null;
  } | null;
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  vote_average: number;
  episodes?: TMDBEpisode[];
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
}

export interface TMDBShowCastMember {
  id: number;
  name: string;
  roles: { character: string; episode_count: number }[];
  profile_path: string | null;
  order: number;
  total_episode_count: number;
  known_for_department: string;
}

export interface TMDBShowCrewMember {
  id: number;
  name: string;
  jobs: { job: string; episode_count: number }[];
  profile_path: string | null;
  department: string;
  total_episode_count: number;
  known_for_department: string;
}

export interface TMDBContentRating {
  iso_3166_1: string;
  rating: string;
}

export function getShowTrailerKey(show: TMDBShow): string | null {
  const videos = (show.videos?.results ?? []).filter((v) => !isAccessibilityVideo(v));
  const trailer = videos.find(
    (v) => v.type === "Trailer" && v.site === "YouTube" && v.official
  ) ?? videos.find((v) => v.type === "Trailer" && v.site === "YouTube");
  return trailer?.key ?? null;
}

export function getShowContentRating(show: TMDBShow): string | null {
  const usRating = show.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
  return usRating?.rating ?? null;
}

// TV API functions
export async function getPopularShows(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>("/tv/popular", { page: String(page) });
}

export async function getTopRatedShows(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>("/tv/top_rated", { page: String(page) });
}

export async function getAiringTodayShows(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>("/tv/airing_today", { page: String(page) });
}

export async function getOnTheAirShows(page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>("/tv/on_the_air", { page: String(page) });
}

export async function getShowDetails(tmdbId: number): Promise<TMDBShow> {
  return tmdbFetch<TMDBShow>(`/tv/${tmdbId}`, {
    append_to_response: "videos,aggregate_credits,content_ratings,images,external_ids",
  });
}

export async function getShowSeasonDetails(showTmdbId: number, seasonNumber: number): Promise<TMDBSeason> {
  return tmdbFetch<TMDBSeason>(`/tv/${showTmdbId}/season/${seasonNumber}`);
}

export async function getShowWatchProviders(tmdbId: number) {
  const data = await tmdbFetch<{ results: Record<string, { flatrate?: TMDBWatchProvider[]; rent?: TMDBWatchProvider[]; buy?: TMDBWatchProvider[] }> }>(`/tv/${tmdbId}/watch/providers`);
  return data.results?.US ?? null;
}

export async function getShowRecommendations(tmdbId: number) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>(`/tv/${tmdbId}/recommendations`);
}

export async function searchShows(query: string, page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBShow>>("/search/tv", {
    query,
    page: String(page),
    include_adult: "false",
  });
}

export async function getShowGenres() {
  if (_tvGenreCache && Date.now() - _tvGenreCache.ts < GENRE_CACHE_TTL) {
    return { genres: _tvGenreCache.genres };
  }
  const data = await tmdbFetch<{ genres: TMDBGenre[] }>("/genre/tv/list");
  _tvGenreCache = { genres: data.genres, ts: Date.now() };
  return data;
}

export const TV_RATING_ORDER = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];

export async function discoverShows(options: {
  query?: string;
  genres?: string[];
  excludeGenres?: string[];
  genreMode?: "any" | "all";
  sort?: string;
  yearFrom?: string;
  yearTo?: string;
  ratingGte?: string;
  ratingLte?: string;
  providers?: string[];
  /** TMDB production company IDs. Pipe-joined → OR semantics. */
  companies?: string[];
  language?: string;
  keywords?: string;
  /** Pipe-joined TMDB keyword IDs to EXCLUDE (without_keywords). */
  excludeKeywords?: string;
  releaseStatus?: string;
  page?: number;
}) {
  const TV_SORT_MAP: Record<string, string> = {
    popular: "popularity.desc",
    top_rated: "vote_average.desc",
    newest: "first_air_date.desc",
    oldest: "first_air_date.asc",
    title_az: "name.asc",
    title_za: "name.desc",
  };
  const sortBy = TV_SORT_MAP[options.sort ?? "popular"] ?? "popularity.desc";
  const isUpcoming = options.releaseStatus === "upcoming";
  const params: Record<string, string> = {
    page: String(options.page ?? 1),
    sort_by: sortBy,
    "vote_count.gte": isUpcoming ? "0" : options.sort === "top_rated" ? "200" : "10",
  };
  if (options.query) params.with_text_query = options.query;
  const genreIds = options.genres?.length ? options.genres : [];
  if (genreIds.length > 0) {
    params.with_genres = genreIds.join(options.genreMode === "all" ? "," : "|");
  }
  if (options.excludeGenres?.length) params.without_genres = options.excludeGenres.join(",");

  // Release status constrains date range / show status
  if (options.releaseStatus === "now_playing") {
    // "Currently Airing" — returning series or in production
    params.with_status = "0|2";
  } else if (isUpcoming) {
    // "Coming Soon" — premiering in the future
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    params["first_air_date.gte"] = tomorrow;
    params["first_air_date.lte"] = sixMonths;
  } else {
    if (options.yearFrom) params["first_air_date.gte"] = `${options.yearFrom}-01-01`;
    if (options.yearTo) params["first_air_date.lte"] = `${options.yearTo}-12-31`;
  }

  if (options.ratingGte) params["vote_average.gte"] = options.ratingGte;
  if (options.ratingLte) params["vote_average.lte"] = options.ratingLte;
  if (options.providers?.length) {
    params.with_watch_providers = options.providers.join("|");
    params.watch_region = "US";
  }
  if (options.language) params.with_original_language = options.language;
  if (options.keywords) params.with_keywords = options.keywords;
  if (options.excludeKeywords) params.without_keywords = options.excludeKeywords.replace(/,/g, "|");
  if (options.companies && options.companies.length > 0) {
    params.with_companies = options.companies.join("|");
  }

  return tmdbFetch<TMDBPageResult<TMDBShow>>("/discover/tv", params);
}

// ─── Language helpers ────────────────────────────────────────────────────────

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "th", name: "Thai" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "id", name: "Indonesian" },
  { code: "tl", name: "Tagalog" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "ml", name: "Malayalam" },
  { code: "cn", name: "Cantonese" },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

// ─── Keyword search ──────────────────────────────────────────────────────────

export interface TMDBKeyword {
  id: number;
  name: string;
}

export async function searchKeywords(query: string, page = 1) {
  return tmdbFetch<TMDBPageResult<TMDBKeyword>>("/search/keyword", {
    query,
    page: String(page),
  });
}
