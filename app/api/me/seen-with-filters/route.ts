import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { maskBlockedInResponse } from "@/lib/safe-content";

export const dynamic = "force-dynamic";

// GET /api/me/seen-with-filters
//
// Returns the signed-in user's seen movies + shows in TMDB-shaped form,
// filtered/sorted/paginated server-side. Backs the /movies page when
// the user toggles `seenStatus=seen`: that path bypasses TMDB Discover
// (which has no concept of "movies this user has seen") and renders
// straight from our DB instead.
//
// The Discover-on-TMDB-then-DOM-hide approach the page used to use was
// returning ~13k results for "Seen + Horror" because TMDB returned the
// global horror catalog and the client just hid unseen tiles. Here we
// query only the user's seen rows and apply genre/year/etc to them
// directly, so the count and results are accurate.
//
// Filters supported (mirroring /movies URL params):
//   - type: "all" | "movie" | "tv"
//   - genres: comma-separated TMDB genre IDs
//   - yearFrom, yearTo
//   - mpaa: comma-separated MPAA cert codes (movies) / TV ratings (shows)
//   - ratingOp: "gte" | "lte"; ratingVal: numeric
//   - search: case-insensitive title contains
//   - sort: "popular" | "top_rated" | "newest" | "oldest" | "title_az" | "title_za" | "relevance"
//   - page, perPage
//
// Filters that DON'T apply to the seen-list path (providers, companies,
// keywords, releaseStatus, AI severity caps, castIds) are ignored — the
// /movies UI surfaces them but they have no meaningful intersection
// with "movies you've already seen". Caller pre-filters its filter pill
// rendering accordingly.

interface SeenMovieRow {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language?: string;
  mediaType: "movie";
}

interface SeenShowRow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  mediaType: "tv";
}

type SeenRow = SeenMovieRow | SeenShowRow;

// TMDB uses different genre IDs for movies vs TV (e.g. movie Action=28
// becomes TV Action & Adventure=10759). Mirror /movies/page.tsx so a
// single user-selected genre matches relevant titles in both worlds.
const GENRE_MOVIE_TO_TV: Record<number, number[]> = {
  28: [10759],   // Action → Action & Adventure
  12: [10759],   // Adventure → Action & Adventure
  878: [10765],  // Science Fiction → Sci-Fi & Fantasy
  14: [10765],   // Fantasy → Sci-Fi & Fantasy
  10752: [10768], // War → War & Politics
};
const MOVIE_ONLY_GENRES = new Set([36, 27, 10402, 10749, 53, 10770]);

function translateGenresForTV(ids: number[]): number[] {
  const out = new Set<number>();
  for (const id of ids) {
    if (GENRE_MOVIE_TO_TV[id]) {
      for (const m of GENRE_MOVIE_TO_TV[id]) out.add(m);
    } else if (!MOVIE_ONLY_GENRES.has(id)) {
      out.add(id);
    }
  }
  return [...out];
}

function parseList(v: string | null): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function applySort(rows: SeenRow[], sort: string): SeenRow[] {
  const out = [...rows];
  switch (sort) {
    case "top_rated":
      out.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
      break;
    case "newest":
      out.sort((a, b) => {
        const da = a.mediaType === "movie" ? a.release_date : a.first_air_date;
        const db = b.mediaType === "movie" ? b.release_date : b.first_air_date;
        return (db ?? "").localeCompare(da ?? "");
      });
      break;
    case "oldest":
      out.sort((a, b) => {
        const da = a.mediaType === "movie" ? a.release_date : a.first_air_date;
        const db = b.mediaType === "movie" ? b.release_date : b.first_air_date;
        return (da ?? "9999").localeCompare(db ?? "9999");
      });
      break;
    case "title_az":
      out.sort((a, b) => {
        const ta = a.mediaType === "movie" ? a.title : a.name;
        const tb = b.mediaType === "movie" ? b.title : b.name;
        return ta.localeCompare(tb);
      });
      break;
    case "title_za":
      out.sort((a, b) => {
        const ta = a.mediaType === "movie" ? a.title : a.name;
        const tb = b.mediaType === "movie" ? b.title : b.name;
        return tb.localeCompare(ta);
      });
      break;
    case "popular":
    case "relevance":
    default:
      out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ results: [], total: 0, totalMovies: 0, totalShows: 0, page: 1, totalPages: 0 });

  const url = req.nextUrl;
  const type = url.searchParams.get("type") ?? "all";
  const genreIds = parseList(url.searchParams.get("genres")).map((g) => Number(g)).filter((n) => Number.isFinite(n));
  const yearFrom = url.searchParams.get("yearFrom");
  const yearTo = url.searchParams.get("yearTo");
  const mpaaList = parseList(url.searchParams.get("mpaa"));
  const ratingOp = url.searchParams.get("ratingOp"); // "gte" | "lte" (default gte)
  const ratingVal = url.searchParams.get("ratingVal");
  const ratingNum = ratingVal != null && ratingVal !== "" ? Number(ratingVal) : null;
  const search = url.searchParams.get("search")?.trim() ?? "";
  const sort = url.searchParams.get("sort") ?? "popular";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const perPage = [20, 50, 100].includes(Number(url.searchParams.get("perPage")))
    ? Number(url.searchParams.get("perPage"))
    : 20;

  const wantMovies = type === "all" || type === "movie";
  const wantShows = type === "all" || type === "tv";

  // ── Movie filters ──
  const movieWhere: Prisma.MovieWhereInput = {
    favoritedBy: { some: { userId: user.id } },
  };
  if (genreIds.length > 0) {
    movieWhere.genres = { some: { genreId: { in: genreIds } } };
  }
  if (yearFrom || yearTo) {
    movieWhere.releaseDate = {};
    if (yearFrom) (movieWhere.releaseDate as { gte?: string }).gte = `${yearFrom}-01-01`;
    if (yearTo) (movieWhere.releaseDate as { lte?: string }).lte = `${yearTo}-12-31`;
  }
  if (mpaaList.length > 0) {
    movieWhere.mpaaRating = { in: mpaaList };
  }
  if (ratingNum != null && Number.isFinite(ratingNum)) {
    movieWhere.voteAverage = ratingOp === "lte" ? { lte: ratingNum } : { gte: ratingNum };
  }
  if (search) {
    movieWhere.title = { contains: search, mode: "insensitive" };
  }

  // ── Show filters ──
  const showWhere: Prisma.TVShowWhereInput = {
    favoritedBy: { some: { userId: user.id } },
  };
  if (genreIds.length > 0) {
    const tvGenreIds = translateGenresForTV(genreIds);
    if (tvGenreIds.length === 0) {
      // User picked only movie-only genres (e.g. Horror) — no shows
      // can match. Force the where to return empty without firing a
      // big query.
      showWhere.id = "__no_match__";
    } else {
      showWhere.genres = { some: { genreId: { in: tvGenreIds } } };
    }
  }
  if (yearFrom || yearTo) {
    showWhere.firstAirDate = {};
    if (yearFrom) (showWhere.firstAirDate as { gte?: string }).gte = `${yearFrom}-01-01`;
    if (yearTo) (showWhere.firstAirDate as { lte?: string }).lte = `${yearTo}-12-31`;
  }
  if (mpaaList.length > 0) {
    showWhere.contentRating = { in: mpaaList };
  }
  if (ratingNum != null && Number.isFinite(ratingNum)) {
    showWhere.voteAverage = ratingOp === "lte" ? { lte: ratingNum } : { gte: ratingNum };
  }
  if (search) {
    showWhere.name = { contains: search, mode: "insensitive" };
  }

  const [movies, shows] = await Promise.all([
    wantMovies
      ? prisma.movie.findMany({
          where: movieWhere,
          select: {
            tmdbId: true, title: true, overview: true, posterPath: true, backdropPath: true,
            releaseDate: true, popularity: true, voteAverage: true, voteCount: true,
            originalLanguage: true,
            genres: { select: { genreId: true } },
          },
        })
      : [],
    wantShows
      ? prisma.tVShow.findMany({
          where: showWhere,
          select: {
            tmdbId: true, name: true, overview: true, posterPath: true, backdropPath: true,
            firstAirDate: true, popularity: true, voteAverage: true, voteCount: true,
            genres: { select: { genreId: true } },
          },
        })
      : [],
  ]);

  const movieRows: SeenMovieRow[] = movies.map((m) => ({
    id: m.tmdbId,
    title: m.title,
    overview: m.overview ?? "",
    poster_path: m.posterPath,
    backdrop_path: m.backdropPath,
    release_date: m.releaseDate ?? "",
    popularity: m.popularity ?? 0,
    vote_average: m.voteAverage ?? 0,
    vote_count: m.voteCount ?? 0,
    genre_ids: m.genres.map((g) => g.genreId),
    original_language: m.originalLanguage ?? undefined,
    mediaType: "movie" as const,
  }));

  const showRows: SeenShowRow[] = shows.map((s) => ({
    id: s.tmdbId,
    name: s.name,
    overview: s.overview ?? "",
    poster_path: s.posterPath,
    backdrop_path: s.backdropPath,
    first_air_date: s.firstAirDate ?? "",
    popularity: s.popularity ?? 0,
    vote_average: s.voteAverage ?? 0,
    vote_count: s.voteCount ?? 0,
    genre_ids: s.genres.map((g) => g.genreId),
    mediaType: "tv" as const,
  }));

  // Defensive dedup by (mediaType, tmdbId). Prisma's findMany on the
  // parent table shouldn't produce duplicates given Movie.tmdbId /
  // TVShow.tmdbId are @unique, but real-world reports of doubled tiles
  // on the seen grid suggest a row pair is sneaking through (likely
  // legacy duplicate sync rows). The cheapest fix at this layer is a
  // Set-based pass; the underlying data dup, if any, can be cleaned in
  // a separate script.
  const seenKeys = new Set<string>();
  const merged: SeenRow[] = [];
  for (const row of [...movieRows, ...showRows]) {
    const key = `${row.mediaType}-${row.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    merged.push(row);
  }
  const sorted = applySort(merged, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const slice = sorted.slice(start, start + perPage);

  return NextResponse.json(await maskBlockedInResponse({
    results: slice,
    total,
    totalMovies: movieRows.length,
    totalShows: showRows.length,
    page,
    totalPages,
  }));
}
