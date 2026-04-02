import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getGenres } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, include: { profile: true } });
  } catch { return null; }
}

let genreCache: Map<string, number> | null = null;
let genreIdToName: Map<number, string> | null = null;
async function getGenreMaps() {
  if (genreCache && genreIdToName) return { nameToId: genreCache, idToName: genreIdToName };
  const data = await getGenres();
  genreCache = new Map(data.genres.map((g) => [g.name, g.id]));
  genreIdToName = new Map(data.genres.map((g) => [g.id, g.name]));
  return { nameToId: genreCache, idToName: genreIdToName };
}

async function tmdbGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const {
      genres = [], experience = "", runtime = "", era = "",
      excludeGenres = [], page = 1, sort: userSort = "",
    } = await req.json();

    const { nameToId, idToName } = await getGenreMaps();
    const currentYear = new Date().getFullYear();

    // Build discover params
    let sort = "popularity.desc";
    let yearFrom = "";
    let yearTo = "";
    let ratingGte = "";
    let voteCountGte = "10";
    let popularityLte = "";

    switch (experience) {
      case "popular":
        sort = "popularity.desc"; yearFrom = String(currentYear - 2); voteCountGte = "100"; break;
      case "hidden_gem":
        sort = "vote_average.desc"; ratingGte = "7"; popularityLte = "30"; voteCountGte = "50"; break;
      case "classic":
        sort = "vote_average.desc"; yearTo = "2005"; ratingGte = "7.5"; voteCountGte = "500"; break;
      case "random":
        sort = "popularity.desc"; break;
    }

    switch (era) {
      case "recent": yearFrom = String(currentYear - 3); yearTo = ""; break;
      case "2000s": yearFrom = "2000"; yearTo = String(currentYear); break;
      case "pre2000": yearTo = "1999"; break;
    }

    // User sort override
    if (userSort === "rating") sort = "vote_average.desc";

    const runtimeParams: Record<string, string> = {};
    switch (runtime) {
      case "short": runtimeParams["with_runtime.lte"] = "100"; break;
      case "standard": runtimeParams["with_runtime.gte"] = "90"; runtimeParams["with_runtime.lte"] = "140"; break;
      case "long": runtimeParams["with_runtime.gte"] = "150"; break;
    }

    const genreIds = genres.map((g: string) => nameToId.get(g)).filter(Boolean).map(String);
    const excludeIds = excludeGenres.map((g: string) => nameToId.get(g)).filter(Boolean).map(String);

    const actualPage = experience === "random" ? Math.floor(Math.random() * 10) + 1 : page;

    const params: Record<string, string> = {
      page: String(actualPage),
      sort_by: sort,
      "vote_count.gte": voteCountGte,
    };
    if (genreIds.length > 0) params.with_genres = genreIds.join("|");
    if (excludeIds.length > 0) params.without_genres = excludeIds.join(",");
    if (yearFrom) params["primary_release_date.gte"] = `${yearFrom}-01-01`;
    if (yearTo) params["primary_release_date.lte"] = `${yearTo}-12-31`;
    if (ratingGte) params["vote_average.gte"] = ratingGte;
    if (popularityLte) params["popularity.lte"] = popularityLte;
    if (sort === "vote_average.desc" && !ratingGte) params["vote_count.gte"] = "200";
    Object.assign(params, runtimeParams);

    // Discover
    const discoverData = await tmdbGet("/discover/movie", params);
    if (!discoverData) return NextResponse.json({ error: "TMDB error" }, { status: 502 });

    const movieIds: number[] = (discoverData.results ?? []).map((m: { id: number }) => m.id);

    // Batch fetch details (runtime, MPAA) + watch providers for all results
    const [detailsArr, providersArr] = await Promise.all([
      Promise.all(movieIds.slice(0, 20).map((id) => tmdbGet(`/movie/${id}`, { append_to_response: "release_dates" }))),
      Promise.all(movieIds.slice(0, 20).map((id) => tmdbGet(`/movie/${id}/watch/providers`))),
    ]);

    const detailsMap = new Map<number, { runtime: number | null; mpaa: string | null }>();
    for (const d of detailsArr) {
      if (!d) continue;
      let mpaa: string | null = null;
      const usRelease = d.release_dates?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
      if (usRelease?.release_dates?.[0]?.certification) mpaa = usRelease.release_dates[0].certification;
      detailsMap.set(d.id, { runtime: d.runtime ?? null, mpaa });
    }

    const providersMap = new Map<number, { stream: string[]; rent: string[] }>();
    for (let i = 0; i < movieIds.length && i < 20; i++) {
      const p = providersArr[i];
      if (!p?.results?.US) continue;
      const us = p.results.US;
      providersMap.set(movieIds[i], {
        stream: (us.flatrate ?? []).map((s: { provider_name: string }) => s.provider_name).slice(0, 3),
        rent: (us.rent ?? []).map((s: { provider_name: string }) => s.provider_name).slice(0, 3),
      });
    }

    // User's genre preferences for match scoring
    const userGenrePrefs = new Map<string, number>();
    if (user?.profile) {
      const p = user.profile as Record<string, unknown>;
      const genreKeys: Record<string, string> = {
        genreAction: "Action", genreHorror: "Horror", genreDrama: "Drama",
        genreScifi: "Science Fiction", genreThriller: "Thriller", genreComedy: "Comedy",
        genreFantasy: "Fantasy", genreRomance: "Romance", genreDocumentary: "Documentary",
        genreFamily: "Family", genreHistorical: "History", genreMusical: "Music",
        genreCrime: "Crime", genreWestern: "Western", genreMystery: "Mystery",
        genreBookAdapt: "Adventure", genreFilmNoir: "Thriller", genreBiopic: "Drama",
      };
      for (const [key, genre] of Object.entries(genreKeys)) {
        const score = Number(p[key]) || 0;
        if (score > 0) {
          const existing = userGenrePrefs.get(genre) ?? 0;
          if (score > existing) userGenrePrefs.set(genre, score);
        }
      }
    }

    // Build results
    let results = (discoverData.results ?? []).map((m: Record<string, unknown>) => {
      const movieGenres = ((m.genre_ids as number[]) ?? []).map((id) => idToName.get(id)).filter(Boolean) as string[];
      const details = detailsMap.get(m.id as number);
      const providers = providersMap.get(m.id as number);

      // Match score: avg of user's genre preferences for this movie's genres
      let matchScore: number | null = null;
      if (userGenrePrefs.size > 0 && movieGenres.length > 0) {
        const scores = movieGenres.map((g) => userGenrePrefs.get(g) ?? 0).filter((s) => s > 0);
        if (scores.length > 0) matchScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      return {
        tmdbId: m.id as number,
        title: m.title as string,
        posterPath: m.poster_path as string | null,
        year: ((m.release_date as string) ?? "").slice(0, 4),
        overview: m.overview as string,
        voteAverage: m.vote_average as number,
        popularity: m.popularity as number,
        genres: movieGenres,
        runtime: details?.runtime ?? null,
        mpaaRating: details?.mpaa ?? null,
        streaming: providers?.stream ?? [],
        rentBuy: providers?.rent ?? [],
        matchScore,
        reason: experience === "popular" ? "Trending now"
          : experience === "hidden_gem" ? "Hidden gem"
          : experience === "classic" ? "Certified classic"
          : experience === "random" ? "Random pick"
          : "Recommended for you",
      };
    });

    // Exclude seen/rated movies
    if (user) {
      const [seenRows, ratedRows] = await Promise.all([
        prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }),
        prisma.movieRating.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }),
      ]);
      const excludeSet = new Set([...seenRows.map((s) => s.movie.tmdbId), ...ratedRows.map((r) => r.movie.tmdbId)]);
      results = results.filter((r: { tmdbId: number }) => !excludeSet.has(r.tmdbId));
    }

    return NextResponse.json({
      results,
      totalPages: discoverData.total_pages ?? 1,
      page: actualPage,
    });
  } catch (err) {
    console.error("Recommend error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
