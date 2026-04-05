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

const EXPERIENCE_LABELS: Record<string, string> = {
  hidden_gem: "Hidden gem",
  classic: "Classic",
  popular: "Popular pick",
  taste: "Based on your taste",
};
function getReasonForExperience(exp: string): string {
  return EXPERIENCE_LABELS[exp] ?? "Popular pick";
}

// Classify results based on their actual characteristics:
// - Classic: excellent AND widely recognized (many votes, high rating)
// - Hidden gem: excellent but genuinely under the radar (few votes, low popularity)
// - Popular pick: well-known, widely viewed
// - Based on your taste: high matchScore from genre preferences
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
  if (experienceArr.includes("classic") && voteAverage >= 7.5 && voteCount >= 1000) {
    candidates.push({ label: "Classic", score: voteAverage * 10 + Math.log10(voteCount) * 5 });
  }
  if (experienceArr.includes("hidden_gem") && voteAverage >= 7.0 && voteCount <= 500 && popularity < 30) {
    candidates.push({ label: "Hidden gem", score: voteAverage * 10 + (30 - popularity) });
  }
  if (experienceArr.includes("popular") && voteCount >= 1000) {
    candidates.push({ label: "Popular pick", score: popularity + Math.log10(voteCount) * 5 });
  }
  if (experienceArr.includes("taste") && matchScore && matchScore > 0) {
    candidates.push({ label: "Based on your taste", score: matchScore * 10 });
  }
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.score - a.score)[0].label;
  }
  // Fallback: classify by characteristics even if not a perfect fit
  if (voteAverage >= 7.5 && voteCount >= 1000) return "Classic";
  if (voteAverage >= 7.0 && voteCount <= 500 && popularity < 30) return "Hidden gem";
  if (voteCount >= 1000) return "Popular pick";
  return experienceArr[0] === "hidden_gem" ? "Hidden gem"
    : experienceArr[0] === "classic" ? "Classic"
    : "Popular pick";
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

    // ── Era ──
    let yearFrom = "";
    let yearTo = "";
    if (eraArr.length > 0) {
      if (eraArr.includes("recent")) yearFrom = String(currentYear - 3);
      if (eraArr.includes("2000s")) yearFrom = yearFrom || "2000";
      if (eraArr.includes("pre2000")) yearTo = "1999";
      if (eraArr.includes("pre2000") && (eraArr.includes("2000s") || eraArr.includes("recent"))) {
        yearFrom = ""; yearTo = "";
      }
    }

    // ── Runtime ──
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
    }
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
    const isTV = mediaType === "tv";
    const isBoth = mediaType === "any";
    const actualPage = experienceArr.length === 0 ? Math.floor(Math.random() * 10) + 1 : page;

    // ── Experience-specific TMDB query params ──
    // Each experience type has its own criteria that produces the right kind of results.
    const EXPERIENCE_PARAMS: Record<string, { sort: string; params: Record<string, string> }> = {
      hidden_gem: {
        sort: "vote_average.desc",
        params: { "vote_average.gte": "7.0", "vote_count.gte": "200", "vote_count.lte": "3000", "popularity.lte": "30" },
      },
      classic: {
        sort: "vote_average.desc",
        params: { "vote_average.gte": "7.5", "vote_count.gte": "1000" },
      },
      popular: {
        sort: "vote_count.desc",
        params: { "vote_count.gte": "1000", "vote_average.gte": "6" },
      },
      taste: {
        sort: "popularity.desc",
        params: { "vote_average.gte": "6", "vote_count.gte": "50" },
      },
    };

    // Build shared params (genre, era, runtime, providers)
    function buildBaseParams(sortBy: string): Record<string, string> {
      const p: Record<string, string> = { page: String(actualPage), sort_by: sortBy };
      if (genreIds.length > 0) p.with_genres = genreIds.join("|");
      if (excludeIds.length > 0) p.without_genres = excludeIds.join(",");
      if (yearFrom) p[isTV ? "first_air_date.gte" : "primary_release_date.gte"] = `${yearFrom}-01-01`;
      if (yearTo) p[isTV ? "first_air_date.lte" : "primary_release_date.lte"] = `${yearTo}-12-31`;
      if (providerIds.length > 0) { p.with_watch_providers = providerIds.join("|"); p.watch_region = "US"; }
      return p;
    }

    function applyUserSort(p: Record<string, string>) {
      if (userSort === "rating") p.sort_by = "vote_average.desc";
      else if (userSort === "newest") p.sort_by = isTV ? "first_air_date.desc" : "primary_release_date.desc";
      else if (userSort === "oldest") p.sort_by = isTV ? "first_air_date.asc" : "primary_release_date.asc";
    }

    function buildTvParams(movieParams: Record<string, string>): Record<string, string> {
      const tv = { ...movieParams };
      delete tv["with_runtime.lte"]; delete tv["with_runtime.gte"];
      Object.assign(tv, tvRuntimeParams);
      if (yearFrom) { tv["first_air_date.gte"] = tv["primary_release_date.gte"]; delete tv["primary_release_date.gte"]; }
      if (yearTo) { tv["first_air_date.lte"] = tv["primary_release_date.lte"]; delete tv["primary_release_date.lte"]; }
      if (tv.sort_by === "primary_release_date.desc") tv.sort_by = "first_air_date.desc";
      if (tv.sort_by === "primary_release_date.asc") tv.sort_by = "first_air_date.asc";
      return tv;
    }

    async function fetchForExperience(exp: string): Promise<{ results: Record<string, unknown>[]; total_pages: number }> {
      const config = EXPERIENCE_PARAMS[exp] ?? { sort: "popularity.desc", params: { "vote_count.gte": "10" } };
      const p = { ...buildBaseParams(config.sort), ...config.params };
      Object.assign(p, runtimeParams);
      applyUserSort(p);
      const tvP = buildTvParams(p);

      if (isBoth) {
        const [mv, tv] = await Promise.all([tmdbGet("/discover/movie", p), tmdbGet("/discover/tv", tvP)]);
        const mvR = (mv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "movie", _experience: exp }));
        const tvR = (tv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "tv", _experience: exp }));
        const merged: Record<string, unknown>[] = [];
        let mi = 0, ti = 0;
        while (mi < mvR.length || ti < tvR.length) {
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (ti < tvR.length) merged.push(tvR[ti++]);
        }
        return { results: merged, total_pages: Math.max(mv?.total_pages ?? 1, tv?.total_pages ?? 1) };
      }
      const endpoint = isTV ? "/discover/tv" : "/discover/movie";
      const fetchP = isTV ? tvP : p;
      const raw = await tmdbGet(endpoint, fetchP);
      return {
        results: (raw?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: isTV ? "tv" : "movie", _experience: exp })),
        total_pages: raw?.total_pages ?? 1,
      };
    }

    // ── Fetch results ──
    let discoverData: { results: Record<string, unknown>[]; total_pages: number };

    if (experienceArr.length > 1) {
      // Multiple experiences: run separate queries, interleave evenly
      const fetches = await Promise.all(experienceArr.map((exp) => fetchForExperience(exp)));
      const perExp = Math.ceil(20 / experienceArr.length);
      const merged: Record<string, unknown>[] = [];
      const cursors = fetches.map(() => 0);
      // Round-robin: take one from each experience in turn
      let added = 0;
      while (added < 20) {
        let anyAdded = false;
        for (let e = 0; e < fetches.length && added < 20; e++) {
          if (cursors[e] < fetches[e].results.length) {
            merged.push(fetches[e].results[cursors[e]++]);
            added++;
            anyAdded = true;
          }
        }
        if (!anyAdded) break;
      }
      discoverData = { results: merged, total_pages: Math.max(...fetches.map((f) => f.total_pages)) };
    } else if (experienceArr.length === 1) {
      discoverData = await fetchForExperience(experienceArr[0]);
      discoverData.results = discoverData.results.slice(0, 20);
    } else {
      // No experience = random popular mix
      const p = { ...buildBaseParams("popularity.desc"), "vote_count.gte": "10" };
      Object.assign(p, runtimeParams);
      applyUserSort(p);
      const tvP = buildTvParams(p);
      if (isBoth) {
        const [mv, tv] = await Promise.all([tmdbGet("/discover/movie", p), tmdbGet("/discover/tv", tvP)]);
        const mvR = (mv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "movie" }));
        const tvR = (tv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "tv" }));
        const merged: Record<string, unknown>[] = [];
        let mi = 0, ti = 0;
        while (mi < mvR.length || ti < tvR.length) {
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (ti < tvR.length) merged.push(tvR[ti++]);
        }
        discoverData = { results: merged.slice(0, 20), total_pages: Math.max(mv?.total_pages ?? 1, tv?.total_pages ?? 1) };
      } else {
        const endpoint = isTV ? "/discover/tv" : "/discover/movie";
        const fetchP = isTV ? tvP : p;
        const raw = await tmdbGet(endpoint, fetchP);
        if (!raw) return NextResponse.json({ error: "TMDB error" }, { status: 502 });
        discoverData = { results: (raw.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: isTV ? "tv" : "movie" })), total_pages: raw.total_pages ?? 1 };
      }
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
        reason: (m._experience as string)
          ? getReasonForExperience(m._experience as string)
          : getReasonForResult(experienceArr, m.vote_average as number, m.vote_count as number, m.popularity as number, matchScore),
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
