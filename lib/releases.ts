/**
 * Release calendar helpers — fetch upcoming theatrical/digital
 * releases from TMDB's discover endpoint with flexible filters.
 *
 * The TMDB discover endpoint already supports release-date ranges,
 * release types, regions, genres, and certifications, so we can
 * lean on it rather than building a local index. Personalization
 * (matching upcoming films against a user's genre persona) wraps
 * the same call with auto-generated filter values.
 */
import type { TMDBMovie, TMDBPageResult } from "./tmdb";
import { prisma } from "./prisma";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

/** TMDB release_type values:
 *   1 = Premiere
 *   2 = Theatrical (limited)
 *   3 = Theatrical (wide)
 *   4 = Digital
 *   5 = Physical
 *   6 = TV
 *
 * For "Coming Soon" defaults we use 2|3 (any theatrical) plus 4
 * (digital) — covers everything a casual user would call "the
 * release date." 5 and 6 surface specialty tracking that bloats
 * the calendar.
 */
export const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "Premiere",
  2: "Theatrical (limited)",
  3: "Theatrical",
  4: "Digital",
  5: "Physical",
  6: "TV",
};

export interface ReleaseFilters {
  /** ISO 3166-1 alpha-2 country code. Drives both `region` (which
   *  TMDB uses to scope which release dates apply) and the
   *  certification country. Defaults to "US". */
  region?: string;
  /** YYYY-MM-DD inclusive lower bound on primary_release_date. */
  fromDate: string;
  /** YYYY-MM-DD inclusive upper bound. */
  toDate: string;
  /** TMDB genre IDs. Multi-genre is OR-matched (TMDB default). */
  genres?: number[];
  /** TMDB release types — see RELEASE_TYPE_LABELS. Comma-joined as
   *  "2|3" syntax in the TMDB query, which is OR. */
  releaseTypes?: number[];
  /** MPA cert codes (e.g., "PG-13"). Multi is OR-matched. */
  certifications?: string[];
  /** Sort order. TMDB defaults to popularity.desc which is a
   *  reasonable Coming-Soon order. */
  sortBy?: "popularity.desc" | "primary_release_date.asc" | "primary_release_date.desc" | "vote_average.desc";
  /** 1-based page number. */
  page?: number;
}

const DEFAULT_RELEASE_TYPES = [2, 3, 4]; // theatrical (limited+wide) + digital

/** Run a TMDB /discover/movie query with the given filters. Returns
 *  the paged result; callers handle pagination and downstream
 *  display. The filter shape mirrors TMDB's API directly to keep
 *  the contract clear. */
export async function getReleases(filters: ReleaseFilters): Promise<TMDBPageResult<TMDBMovie>> {
  const region = filters.region ?? "US";
  const types = (filters.releaseTypes ?? DEFAULT_RELEASE_TYPES).join("|");

  const params = new URLSearchParams({
    api_key: API_KEY ?? "",
    sort_by: filters.sortBy ?? "popularity.desc",
    "primary_release_date.gte": filters.fromDate,
    "primary_release_date.lte": filters.toDate,
    with_release_type: types,
    region,
    page: String(filters.page ?? 1),
    // TMDB filters out adult by default but make it explicit.
    include_adult: "false",
  });

  if (filters.genres && filters.genres.length > 0) {
    // Pipe-joined = OR. Comma-joined would be AND, which makes the
    // result set very small.
    params.set("with_genres", filters.genres.join("|"));
  }
  if (filters.certifications && filters.certifications.length > 0) {
    params.set("certification_country", region);
    params.set("certification", filters.certifications.join("|"));
  }

  const res = await fetch(`${BASE}/discover/movie?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 6 }, // 6h cache, lighter than the leaderboard pages
  });
  if (!res.ok) {
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }
  return res.json();
}

/** Map UserProfile genre fields back to TMDB genre IDs. Mirror of
 *  TMDB_GENRE_TO_PROFILE in lib/profile.ts but reversed. Multiple
 *  TMDB genres can collapse to one profile field (e.g., 28 Action
 *  and 12 Adventure both go to genreAction); for personalization
 *  we use the most representative TMDB id for each. */
const PROFILE_TO_TMDB_GENRES: Array<{ key: string; tmdbId: number }> = [
  { key: "genreAction",      tmdbId: 28 },
  { key: "genreComedy",      tmdbId: 35 },
  { key: "genreCrime",       tmdbId: 80 },
  { key: "genreDocumentary", tmdbId: 99 },
  { key: "genreDrama",       tmdbId: 18 },
  { key: "genreFamily",      tmdbId: 10751 },
  { key: "genreFantasy",     tmdbId: 14 },
  { key: "genreHistorical",  tmdbId: 36 },
  { key: "genreHorror",      tmdbId: 27 },
  { key: "genreMusical",     tmdbId: 10402 },
  { key: "genreMystery",     tmdbId: 9648 },
  { key: "genreRomance",     tmdbId: 10749 },
  { key: "genreScifi",       tmdbId: 878 },
  { key: "genreThriller",    tmdbId: 53 },
  { key: "genreWestern",     tmdbId: 37 },
];

/** Returns the TMDB genre IDs the user scores highest on. Used to
 *  filter the For You release feed so we only surface releases that
 *  match the user's existing taste profile. Top N (default 5) by
 *  score, only including scores ≥ minScore so a flat / new user
 *  doesn't get every genre returned. */
export async function getUserTopTmdbGenres(
  userId: string,
  count: number = 5,
  minScore: number = 5,
): Promise<number[]> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return [];
  const scored = PROFILE_TO_TMDB_GENRES.map((g) => ({
    tmdbId: g.tmdbId,
    score: (profile as unknown as Record<string, number>)[g.key] ?? 0,
  })).filter((g) => g.score >= minScore);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((g) => g.tmdbId);
}
