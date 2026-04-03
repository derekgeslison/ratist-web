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
  genres?: { id: number; name: string }[];
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null;
  videos?: { results: TMDBVideo[] };
  credits?: { cast: TMDBCastMember[]; crew: TMDBCrewMember[] };
  release_dates?: { results: TMDBReleaseDateResult[] };
  images?: { backdrops: TMDBImage[]; posters: TMDBImage[] };
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
  if (!path) return "/placeholder-poster.png";
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function backdropUrl(path: string | null, size = "w1280"): string {
  if (!path) return "/placeholder-backdrop.png";
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function getTrailerKey(movie: TMDBMovie): string | null {
  const videos = movie.videos?.results ?? [];
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
    sort_by: "primary_release_date.asc",
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

export async function discoverMovies(options: {
  query?: string;
  genres?: string[];
  genreMode?: "any" | "all";
  castIds?: string[];
  sort?: string;
  yearFrom?: string;
  yearTo?: string;
  certMin?: string;
  certMax?: string;
  ratingGte?: string;
  ratingLte?: string;
  page?: number;
  // legacy
  genre?: string;
  minRating?: string;
}) {
  const sortBy = SORT_MAP[options.sort ?? "popular"] ?? "popularity.desc";
  const params: Record<string, string> = {
    page: String(options.page ?? 1),
    sort_by: sortBy,
    "vote_count.gte": options.sort === "top_rated" ? "200" : "10",
  };
  if (options.query) params.with_text_query = options.query;

  const genreIds = options.genres?.length ? options.genres : (options.genre ? [options.genre] : []);
  if (genreIds.length > 0) {
    params.with_genres = genreIds.join(options.genreMode === "all" ? "," : "|");
  }
  if (options.castIds?.length) params.with_cast = options.castIds.join(",");
  if (options.yearFrom) params["primary_release_date.gte"] = `${options.yearFrom}-01-01`;
  if (options.yearTo) params["primary_release_date.lte"] = `${options.yearTo}-12-31`;
  if (options.ratingGte) params["vote_average.gte"] = options.ratingGte;
  else if (options.minRating) params["vote_average.gte"] = options.minRating;
  if (options.ratingLte) params["vote_average.lte"] = options.ratingLte;
  if (options.certMin || options.certMax) {
    params.certification_country = "US";
    if (options.certMin) params["certification.gte"] = options.certMin;
    if (options.certMax) params["certification.lte"] = options.certMax;
  }

  return tmdbFetch<TMDBPageResult<TMDBMovie>>("/discover/movie", params);
}

export async function getGenres() {
  return tmdbFetch<{ genres: TMDBGenre[] }>("/genre/movie/list");
}
