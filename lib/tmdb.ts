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

export function posterUrl(path: string | null, size = "w500"): string {
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

export async function getNowPlayingMovies(page = 1) {
  const today = new Date().toISOString().split("T")[0];
  const daysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", {
    page: String(page),
    sort_by: "popularity.desc",
    "primary_release_date.gte": daysAgo,
    "primary_release_date.lte": today,
    "vote_count.gte": "5",
    with_release_type: "2|3",
    region: "US",
  });
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
  genreMode?: "any" | "all";
  castIds?: string[];
  sort?: string;
  yearFrom?: string;
  yearTo?: string;
  certifications?: string[];
  ratingGte?: string;
  ratingLte?: string;
  providers?: string[];
  language?: string;
  keywords?: string;
  releaseStatus?: string;
  page?: number;
  // legacy
  genre?: string;
  minRating?: string;
}) {
  const sortBy = SORT_MAP[options.sort ?? "popular"] ?? "popularity.desc";
  const isUpcoming = options.releaseStatus === "upcoming";
  const params: Record<string, string> = {
    page: String(options.page ?? 1),
    sort_by: sortBy,
    "vote_count.gte": isUpcoming ? "0" : options.sort === "top_rated" ? "200" : "10",
  };
  if (options.query) params.with_text_query = options.query;

  const genreIds = options.genres?.length ? options.genres : (options.genre ? [options.genre] : []);
  if (genreIds.length > 0) {
    params.with_genres = genreIds.join(options.genreMode === "all" ? "," : "|");
  }
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

  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", params);
}

// In-memory genre cache (survives across requests within the same server instance)
let _movieGenreCache: { genres: TMDBGenre[]; ts: number } | null = null;
let _tvGenreCache: { genres: TMDBGenre[]; ts: number } | null = null;
const GENRE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getGenres() {
  // In-memory cache (fastest)
  if (_movieGenreCache && Date.now() - _movieGenreCache.ts < GENRE_CACHE_TTL) {
    return { genres: _movieGenreCache.genres };
  }
  // DB cache
  try {
    const { prisma } = await import("@/lib/prisma");
    const dbGenres = await prisma.genre.findMany({ select: { id: true, name: true } });
    if (dbGenres.length > 0) {
      _movieGenreCache = { genres: dbGenres, ts: Date.now() };
      return { genres: dbGenres };
    }
  } catch { /* DB not ready */ }
  // TMDB fallback + backfill
  const data = await tmdbFetch<{ genres: TMDBGenre[] }>("/genre/movie/list");
  _movieGenreCache = { genres: data.genres, ts: Date.now() };
  // Backfill DB (fire and forget)
  import("@/lib/prisma").then(({ prisma }) =>
    Promise.all(data.genres.map((g) =>
      prisma.genre.upsert({ where: { id: g.id }, create: { id: g.id, name: g.name }, update: { name: g.name } })
    ))
  ).catch(() => {});
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
  created_by?: { id: number; name: string; profile_path: string | null }[];
  seasons?: TMDBSeason[];
  videos?: { results: TMDBVideo[] };
  aggregate_credits?: { cast: TMDBShowCastMember[]; crew: TMDBShowCrewMember[] };
  content_ratings?: { results: TMDBContentRating[] };
  images?: { backdrops: TMDBImage[]; posters: TMDBImage[] };
  external_ids?: { imdb_id?: string };
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
  // In-memory cache
  if (_tvGenreCache && Date.now() - _tvGenreCache.ts < GENRE_CACHE_TTL) {
    return { genres: _tvGenreCache.genres };
  }
  // TMDB (TV genres have different IDs, not stored in the shared Genre table)
  const data = await tmdbFetch<{ genres: TMDBGenre[] }>("/genre/tv/list");
  _tvGenreCache = { genres: data.genres, ts: Date.now() };
  return data;
}

export const TV_RATING_ORDER = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];

export async function discoverShows(options: {
  query?: string;
  genres?: string[];
  genreMode?: "any" | "all";
  sort?: string;
  yearFrom?: string;
  yearTo?: string;
  ratingGte?: string;
  ratingLte?: string;
  providers?: string[];
  language?: string;
  keywords?: string;
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
