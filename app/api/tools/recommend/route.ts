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

function getReasonForResult(
  experienceArr: string[],
  voteAverage: number,
  voteCount: number,
  popularity: number,
  matchScore: number | null,
): string {
  if (experienceArr.length === 0) return "Random pick";
  // When only one experience selected, use it directly
  if (experienceArr.length === 1) {
    if (experienceArr[0] === "classic") return "Classic";
    if (experienceArr[0] === "hidden_gem") return "Hidden gem";
    if (experienceArr[0] === "popular") return "Popular pick";
    if (experienceArr[0] === "taste") return "Based on your taste";
  }
  // Multiple experiences: label each result by what it best matches
  const candidates: { label: string; score: number }[] = [];
  if (experienceArr.includes("classic") && voteAverage >= 7.5 && voteCount >= 500) {
    candidates.push({ label: "Classic", score: voteAverage * 10 + voteCount / 100 });
  }
  if (experienceArr.includes("hidden_gem") && voteAverage >= 6.5 && popularity < 50) {
    candidates.push({ label: "Hidden gem", score: voteAverage * 10 + (50 - popularity) });
  }
  if (experienceArr.includes("popular") && voteCount >= 500) {
    candidates.push({ label: "Popular pick", score: popularity + voteCount / 100 });
  }
  if (experienceArr.includes("taste") && matchScore && matchScore > 0) {
    candidates.push({ label: "Based on your taste", score: matchScore * 10 });
  }
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.score - a.score)[0].label;
  }
  // Fallback: best-fit label based on characteristics
  if (voteAverage >= 7.5 && voteCount >= 500) return "Classic";
  if (popularity < 50 && voteAverage >= 6.5) return "Hidden gem";
  return "Popular pick";
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    const body = await req.json();
    const genres: string[] = body.genres ?? [];
    const experienceArr: string[] = Array.isArray(body.experience) ? body.experience : (body.experience ? [body.experience] : []);
    const runtimeArr: string[] = Array.isArray(body.runtime) ? body.runtime : (body.runtime ? [body.runtime] : []);
    const eraArr: string[] = Array.isArray(body.era) ? body.era : (body.era ? [body.era] : []);
    const excludeGenres: string[] = body.excludeGenres ?? [];
    const page: number = body.page ?? 1;
    const userSort: string = body.sort ?? "match";
    const mediaType: string = body.mediaType ?? "any";
    const providerIds: number[] = body.providers ?? [];

    const { nameToId, idToName } = await getGenreMaps();
    const currentYear = new Date().getFullYear();

    // Build discover params — experience sets the "what kind" but never restricts year
    let sort = "popularity.desc";
    let yearFrom = "";
    let yearTo = "";
    let ratingGte = "";
    let voteCountGte = "10";
    let popularityLte = "";

    // Experience: apply the first matching preference (priority order)
    if (experienceArr.includes("hidden_gem")) {
      sort = "vote_average.desc"; ratingGte = "7"; popularityLte = "30"; voteCountGte = "50";
    } else if (experienceArr.includes("classic")) {
      sort = "vote_average.desc"; ratingGte = "7.5"; voteCountGte = "500";
    } else if (experienceArr.includes("popular")) {
      sort = "vote_count.desc"; voteCountGte = "1000"; ratingGte = "6";
    } else if (experienceArr.includes("taste")) {
      // Use popularity as base query, matchScore re-sorting happens client-side
      sort = "popularity.desc"; ratingGte = "6"; voteCountGte = "50";
    } else if (experienceArr.length === 0) {
      // No experience selected = random mix
      sort = "popularity.desc";
    }
    // If multiple selected, loosen constraints
    if (experienceArr.length > 1) {
      ratingGte = ratingGte ? "6" : "";
      voteCountGte = "50";
      popularityLte = "";
    }

    // Era: combine ranges from all selections
    if (eraArr.length > 0) {
      if (eraArr.includes("recent")) yearFrom = String(currentYear - 3);
      if (eraArr.includes("2000s")) yearFrom = yearFrom || "2000";
      if (eraArr.includes("pre2000")) yearTo = "1999";
      // If both pre2000 and 2000s+ selected, it covers all eras — clear constraints
      if (eraArr.includes("pre2000") && (eraArr.includes("2000s") || eraArr.includes("recent"))) {
        yearFrom = ""; yearTo = "";
      }
    }

    // User sort override
    if (userSort === "rating") sort = "vote_average.desc";
    else if (userSort === "newest") sort = mediaType === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
    else if (userSort === "oldest") sort = mediaType === "tv" ? "first_air_date.asc" : "primary_release_date.asc";

    // Movie runtime: combine ranges from selections
    const runtimeParams: Record<string, string> = {};
    if (runtimeArr.length > 0 && !runtimeArr.includes("")) {
      const hasShort = runtimeArr.includes("short");
      const hasStandard = runtimeArr.includes("standard");
      const hasLong = runtimeArr.includes("long");
      if (hasShort && !hasStandard && !hasLong) runtimeParams["with_runtime.lte"] = "100";
      else if (!hasShort && hasStandard && !hasLong) { runtimeParams["with_runtime.gte"] = "90"; runtimeParams["with_runtime.lte"] = "140"; }
      else if (!hasShort && !hasStandard && hasLong) runtimeParams["with_runtime.gte"] = "150";
      else if (hasShort && hasStandard && !hasLong) runtimeParams["with_runtime.lte"] = "140";
      else if (!hasShort && hasStandard && hasLong) runtimeParams["with_runtime.gte"] = "90";
      // if all three selected or short+long, no constraint needed
    }
    // TV episode runtime
    const tvRuntimeParams: Record<string, string> = {};
    if (runtimeArr.length > 0) {
      const hasShortEp = runtimeArr.includes("short_ep");
      const hasStdEp = runtimeArr.includes("standard_ep");
      const hasLongEp = runtimeArr.includes("long_ep");
      if (hasShortEp && !hasStdEp && !hasLongEp) tvRuntimeParams["with_runtime.lte"] = "35";
      else if (!hasShortEp && hasStdEp && !hasLongEp) { tvRuntimeParams["with_runtime.gte"] = "35"; tvRuntimeParams["with_runtime.lte"] = "65"; }
      else if (!hasShortEp && !hasStdEp && hasLongEp) tvRuntimeParams["with_runtime.gte"] = "55";
      else if (hasShortEp && hasStdEp && !hasLongEp) tvRuntimeParams["with_runtime.lte"] = "65";
      else if (!hasShortEp && hasStdEp && hasLongEp) tvRuntimeParams["with_runtime.gte"] = "35";
    }

    const genreIds = genres.map((g: string) => nameToId.get(g)).filter(Boolean).map(String);
    const excludeIds = excludeGenres.map((g: string) => nameToId.get(g)).filter(Boolean).map(String);

    const actualPage = experienceArr.length === 0 ? Math.floor(Math.random() * 10) + 1 : page;

    const params: Record<string, string> = {
      page: String(actualPage),
      sort_by: sort,
      "vote_count.gte": voteCountGte,
    };
    if (genreIds.length > 0) params.with_genres = genreIds.join("|");
    if (excludeIds.length > 0) params.without_genres = excludeIds.join(",");
    const isTV = mediaType === "tv";
    if (yearFrom) params[isTV ? "first_air_date.gte" : "primary_release_date.gte"] = `${yearFrom}-01-01`;
    if (yearTo) params[isTV ? "first_air_date.lte" : "primary_release_date.lte"] = `${yearTo}-12-31`;
    if (ratingGte) params["vote_average.gte"] = ratingGte;
    if (popularityLte) params["popularity.lte"] = popularityLte;
    if (sort === "vote_average.desc" && !ratingGte) params["vote_count.gte"] = "200";
    if (providerIds.length > 0) {
      params.with_watch_providers = providerIds.join("|");
      params.watch_region = "US";
    }
    Object.assign(params, runtimeParams);

    // Discover — movie, TV, or both
    const isBoth = mediaType === "any";
    const tvParams = { ...params };
    // Replace movie runtime with TV episode runtime
    delete tvParams["with_runtime.lte"];
    delete tvParams["with_runtime.gte"];
    Object.assign(tvParams, tvRuntimeParams);
    // TV uses different date and sort params
    if (yearFrom) { tvParams["first_air_date.gte"] = tvParams["primary_release_date.gte"]; delete tvParams["primary_release_date.gte"]; }
    if (yearTo) { tvParams["first_air_date.lte"] = tvParams["primary_release_date.lte"]; delete tvParams["primary_release_date.lte"]; }
    // Fix TV sort for date-based sorts
    if (tvParams.sort_by === "primary_release_date.desc") tvParams.sort_by = "first_air_date.desc";
    if (tvParams.sort_by === "primary_release_date.asc") tvParams.sort_by = "first_air_date.asc";

    let discoverData: { results: Record<string, unknown>[]; total_pages: number };

    if (isBoth) {
      // Fetch both movie and TV, interleave
      const [movieDiscover, tvDiscover] = await Promise.all([
        tmdbGet("/discover/movie", params),
        tmdbGet("/discover/tv", tvParams),
      ]);
      const movieResults = (movieDiscover?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "movie" }));
      const tvResults = (tvDiscover?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "tv" }));
      // Interleave: 2 movies, 1 show pattern
      const merged: Record<string, unknown>[] = [];
      let mi = 0, ti = 0;
      while (mi < movieResults.length || ti < tvResults.length) {
        if (mi < movieResults.length) merged.push(movieResults[mi++]);
        if (mi < movieResults.length) merged.push(movieResults[mi++]);
        if (ti < tvResults.length) merged.push(tvResults[ti++]);
      }
      discoverData = { results: merged.slice(0, 20), total_pages: Math.max(movieDiscover?.total_pages ?? 1, tvDiscover?.total_pages ?? 1) };
    } else {
      const discoverEndpoint = isTV ? "/discover/tv" : "/discover/movie";
      const fetchParams = isTV ? tvParams : params;
      const raw = await tmdbGet(discoverEndpoint, fetchParams);
      if (!raw) return NextResponse.json({ error: "TMDB error" }, { status: 502 });
      discoverData = { results: (raw.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: isTV ? "tv" : "movie" })), total_pages: raw.total_pages ?? 1 };
    }

    const resultIds: number[] = discoverData.results.map((m) => m.id as number);
    const resultMediaTypes: string[] = discoverData.results.map((m) => m._mediaType as string);

    // Batch fetch details + watch providers (per-item media type aware)
    const [detailsArr, providersArr] = await Promise.all([
      Promise.all(resultIds.slice(0, 20).map((id, i) => {
        const mt = resultMediaTypes[i];
        const path = mt === "tv" ? `/tv/${id}` : `/movie/${id}`;
        const append = mt === "tv" ? "content_ratings" : "release_dates";
        return tmdbGet(path, { append_to_response: append });
      })),
      Promise.all(resultIds.slice(0, 20).map((id, i) => {
        const mt = resultMediaTypes[i];
        return tmdbGet(`/${mt === "tv" ? "tv" : "movie"}/${id}/watch/providers`);
      })),
    ]);

    const detailsMap = new Map<number, { runtime: number | null; mpaa: string | null }>();
    for (let idx = 0; idx < detailsArr.length; idx++) {
      const d = detailsArr[idx];
      if (!d) continue;
      let mpaa: string | null = null;
      const mt = resultMediaTypes[idx];
      if (mt === "tv") {
        const usRating = d.content_ratings?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
        if (usRating?.rating) mpaa = usRating.rating;
        const avgRuntime = d.episode_run_time?.length
          ? Math.round(d.episode_run_time.reduce((a: number, b: number) => a + b, 0) / d.episode_run_time.length)
          : null;
        detailsMap.set(d.id, { runtime: avgRuntime, mpaa });
      } else {
        const usRelease = d.release_dates?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
        if (usRelease?.release_dates) {
          for (const rd of usRelease.release_dates) {
            if (rd.certification) { mpaa = rd.certification; break; }
          }
        }
        detailsMap.set(d.id, { runtime: d.runtime ?? null, mpaa });
      }
    }

    const providersMap = new Map<number, { stream: { name: string; logo: string }[]; rent: { name: string; logo: string }[] }>();
    for (let i = 0; i < resultIds.length && i < 20; i++) {
      const p = providersArr[i];
      if (!p?.results?.US) continue;
      const us = p.results.US;
      providersMap.set(resultIds[i], {
        stream: (us.flatrate ?? []).map((s: { provider_name: string; logo_path: string }) => ({ name: s.provider_name, logo: s.logo_path })).slice(0, 5),
        rent: (us.rent ?? []).map((s: { provider_name: string; logo_path: string }) => ({ name: s.provider_name, logo: s.logo_path })).slice(0, 3),
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
      const mt = m._mediaType as string;
      const itemGenres = ((m.genre_ids as number[]) ?? []).map((id) => idToName.get(id)).filter(Boolean) as string[];
      const details = detailsMap.get(m.id as number);
      const providers = providersMap.get(m.id as number);

      let matchScore: number | null = null;
      if (userGenrePrefs.size > 0 && itemGenres.length > 0) {
        const scores = itemGenres.map((g) => userGenrePrefs.get(g) ?? 0).filter((s) => s > 0);
        if (scores.length > 0) matchScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      return {
        tmdbId: m.id as number,
        title: (mt === "tv" ? m.name : m.title) as string,
        posterPath: m.poster_path as string | null,
        year: ((mt === "tv" ? m.first_air_date : m.release_date) as string ?? "").slice(0, 4),
        overview: m.overview as string,
        voteAverage: m.vote_average as number,
        popularity: m.popularity as number,
        genres: itemGenres,
        runtime: details?.runtime ?? null,
        mpaaRating: details?.mpaa ?? null,
        mediaType: mt,
        streaming: providers?.stream ?? [],
        rentBuy: providers?.rent ?? [],
        matchScore,
        reason: getReasonForResult(
          experienceArr,
          m.vote_average as number,
          m.vote_count as number,
          m.popularity as number,
          matchScore,
        ),
      };
    });

    // Exclude seen/rated content
    if (user) {
      const [seenMovies, ratedMovies, seenShows, ratedShows] = await Promise.all([
        (!isTV || isBoth) ? prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }) : Promise.resolve([]),
        (!isTV || isBoth) ? prisma.movieRating.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }) : Promise.resolve([]),
        (isTV || isBoth) ? prisma.userFavoriteShow.findMany({ where: { userId: user.id }, select: { tvShow: { select: { tmdbId: true } } } }) : Promise.resolve([]),
        (isTV || isBoth) ? prisma.tVShowRating.findMany({ where: { userId: user.id }, select: { tvShow: { select: { tmdbId: true } } } }) : Promise.resolve([]),
      ]);
      const movieExclude = new Set([
        ...(seenMovies as { movie: { tmdbId: number } }[]).map((s) => s.movie.tmdbId),
        ...(ratedMovies as { movie: { tmdbId: number } }[]).map((r) => r.movie.tmdbId),
      ]);
      const tvExclude = new Set([
        ...(seenShows as { tvShow: { tmdbId: number } }[]).map((s) => s.tvShow.tmdbId),
        ...(ratedShows as { tvShow: { tmdbId: number } }[]).map((r) => r.tvShow.tmdbId),
      ]);
      results = results.filter((r: { tmdbId: number; mediaType: string }) =>
        r.mediaType === "tv" ? !tvExclude.has(r.tmdbId) : !movieExclude.has(r.tmdbId)
      );
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
