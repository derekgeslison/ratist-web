import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { discoverMovies, getGenres } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch { return null; }
}

// TMDB genre name → ID mapping (cached)
let genreCache: Map<string, number> | null = null;
async function getGenreMap(): Promise<Map<string, number>> {
  if (genreCache) return genreCache;
  const data = await getGenres();
  genreCache = new Map(data.genres.map((g) => [g.name, g.id]));
  return genreCache;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);

    const {
      genres = [],        // string[] of genre names
      experience = "",    // "popular" | "hidden_gem" | "classic" | "random"
      runtime = "",       // "short" | "standard" | "long" | ""
      era = "",           // "recent" | "modern" | "throwback" | ""
      excludeGenres = [], // string[] of genre names to exclude
      page = 1,
    } = await req.json();

    const genreMap = await getGenreMap();

    // Build TMDB discover params
    const currentYear = new Date().getFullYear();
    let sort = "popularity.desc";
    let yearFrom = "";
    let yearTo = "";
    let ratingGte = "";
    let voteCountGte = "10";
    let popularityLte = "";

    // Experience type
    switch (experience) {
      case "popular":
        sort = "popularity.desc";
        yearFrom = String(currentYear - 2);
        voteCountGte = "100";
        break;
      case "hidden_gem":
        sort = "vote_average.desc";
        ratingGte = "7";
        popularityLte = "30";
        voteCountGte = "50";
        break;
      case "classic":
        sort = "vote_average.desc";
        yearTo = "2005";
        ratingGte = "7.5";
        voteCountGte = "500";
        break;
      case "random":
        sort = "popularity.desc";
        // Use a random page offset for variety
        break;
    }

    // Era override
    switch (era) {
      case "recent":
        yearFrom = String(currentYear - 3);
        yearTo = "";
        break;
      case "modern":
        yearFrom = "2010";
        yearTo = String(currentYear);
        break;
      case "throwback":
        yearTo = "2009";
        break;
    }

    // Runtime
    const runtimeParams: Record<string, string> = {};
    switch (runtime) {
      case "short":
        runtimeParams["with_runtime.lte"] = "100";
        break;
      case "standard":
        runtimeParams["with_runtime.gte"] = "90";
        runtimeParams["with_runtime.lte"] = "140";
        break;
      case "long":
        runtimeParams["with_runtime.gte"] = "150";
        break;
    }

    // Genre IDs
    const genreIds = genres
      .map((g: string) => genreMap.get(g))
      .filter(Boolean)
      .map(String);

    const excludeGenreIds = excludeGenres
      .map((g: string) => genreMap.get(g))
      .filter(Boolean)
      .map(String);

    // For random experience, pick a random page (1-10)
    const actualPage = experience === "random"
      ? Math.floor(Math.random() * 10) + 1
      : page;

    // Build discover call
    const params: Record<string, string> = {
      page: String(actualPage),
      sort_by: sort,
      "vote_count.gte": voteCountGte,
    };
    if (genreIds.length > 0) params.with_genres = genreIds.join("|");
    if (excludeGenreIds.length > 0) params.without_genres = excludeGenreIds.join(",");
    if (yearFrom) params["primary_release_date.gte"] = `${yearFrom}-01-01`;
    if (yearTo) params["primary_release_date.lte"] = `${yearTo}-12-31`;
    if (ratingGte) params["vote_average.gte"] = ratingGte;
    if (popularityLte) params["popularity.lte"] = popularityLte;
    Object.assign(params, runtimeParams);

    // Fetch from TMDB
    const API_KEY = process.env.TMDB_API_KEY;
    const url = new URL("https://api.themoviedb.org/3/discover/movie");
    url.searchParams.set("api_key", API_KEY!);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const tmdbRes = await fetch(url.toString());
    if (!tmdbRes.ok) return NextResponse.json({ error: "TMDB error" }, { status: 502 });
    const tmdbData = await tmdbRes.json();

    let results: {
      tmdbId: number;
      title: string;
      posterPath: string | null;
      year: string;
      overview: string;
      voteAverage: number;
      popularity: number;
      reason: string;
    }[] = (tmdbData.results ?? []).map((m: Record<string, unknown>) => ({
      tmdbId: m.id as number,
      title: m.title as string,
      posterPath: m.poster_path as string | null,
      year: ((m.release_date as string) ?? "").slice(0, 4),
      overview: m.overview as string,
      voteAverage: m.vote_average as number,
      popularity: m.popularity as number,
      reason: experience === "popular" ? "Trending now"
        : experience === "hidden_gem" ? "Hidden gem"
        : experience === "classic" ? "Certified classic"
        : experience === "random" ? "Random pick"
        : "Recommended for you",
    }));

    // Exclude movies the user has already seen
    if (user) {
      const seenTmdbIds = new Set(
        (await prisma.userFavoriteMovie.findMany({
          where: { userId: user.id },
          select: { movie: { select: { tmdbId: true } } },
        })).map((s) => s.movie.tmdbId)
      );
      const ratedTmdbIds = new Set(
        (await prisma.movieRating.findMany({
          where: { userId: user.id },
          select: { movie: { select: { tmdbId: true } } },
        })).map((r) => r.movie.tmdbId)
      );
      results = results.filter((r) => !seenTmdbIds.has(r.tmdbId) && !ratedTmdbIds.has(r.tmdbId));
    }

    return NextResponse.json({
      results,
      totalPages: tmdbData.total_pages ?? 1,
      page: actualPage,
    });
  } catch (err) {
    console.error("Recommend error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
