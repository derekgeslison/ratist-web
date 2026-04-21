import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getGenres } from "@/lib/tmdb";
import { expandMoods } from "@/lib/ai/mood-expand";
import { resolveKeywords } from "@/lib/tmdb-keywords";

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

// Mirror /movies page mapping so "Science Fiction" movie selection also finds
// TV shows tagged "Sci-Fi & Fantasy", etc. Movie-only genres (Romance, Horror,
// History, Music, Thriller, TV Movie) have no TV equivalent and are dropped.
const GENRE_MOVIE_TO_TV: Record<string, string[]> = {
  "28": ["10759"],    // Action → Action & Adventure
  "12": ["10759"],    // Adventure → Action & Adventure
  "878": ["10765"],   // Science Fiction → Sci-Fi & Fantasy
  "14": ["10765"],    // Fantasy → Sci-Fi & Fantasy
  "10752": ["10768"], // War → War & Politics
};
const MOVIE_ONLY_GENRES = new Set(["36", "27", "10402", "10749", "53", "10770"]); // History, Horror, Music, Romance, Thriller, TV Movie

function translateGenresForTV(ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    if (GENRE_MOVIE_TO_TV[id]) for (const m of GENRE_MOVIE_TO_TV[id]) out.add(m);
    else if (!MOVIE_ONLY_GENRES.has(id)) out.add(id);
  }
  return [...out];
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
    const rawGenres: string[] = body.genres ?? [];
    const experienceArr: string[] = Array.isArray(body.experience) ? body.experience : (body.experience ? [body.experience] : []);
    const runtimeArr: string[] = Array.isArray(body.runtime) ? body.runtime : (body.runtime ? [body.runtime] : []);
    const eraArr: string[] = Array.isArray(body.era) ? body.era : (body.era ? [body.era] : []);
    const rawExcludeGenres: string[] = body.excludeGenres ?? [];
    const moodsArr: string[] = Array.isArray(body.moods) ? body.moods : [];
    const originalLanguageArr: string[] = Array.isArray(body.originalLanguage)
      ? body.originalLanguage.filter((l: unknown): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [];
    const excludeOriginalLanguagesArr: string[] = Array.isArray(body.excludeOriginalLanguages)
      ? body.excludeOriginalLanguages.filter((l: unknown): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [];
    const excludeAnimeFlag: boolean = body.excludeAnime === true;
    const precisePeriodFrom: number | null = typeof body.yearFrom === "number" && body.yearFrom > 1800 ? Math.floor(body.yearFrom) : null;
    const precisePeriodTo: number | null = typeof body.yearTo === "number" && body.yearTo > 1800 ? Math.floor(body.yearTo) : null;
    const minRatingNum: number | null = typeof body.minRating === "number" && body.minRating >= 0 && body.minRating <= 10 ? body.minRating : null;
    const keywordPhrases: string[] = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown): k is string => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase()).slice(0, 3)
      : [];
    const keywordIds = keywordPhrases.length > 0 ? await resolveKeywords(keywordPhrases) : [];
    const keywordsParam = keywordIds.length > 0 ? keywordIds.join("|") : undefined;

    // Expand hidden mood tags into genre adds / avoids. Moods don't count as
    // UI filters but they re-shape the search (e.g. "dark" adds Drama/Crime/
    // Thriller, avoids Comedy/Family). See lib/ai/mood-expand.ts.
    const MOOD_VALUES = new Set(["feel-good", "dark", "scary", "romantic", "tearjerker", "mind-bending", "thought-provoking", "epic", "inspiring", "offbeat", "funny", "edge-of-seat"]);
    const validMoods = moodsArr.filter((m) => MOOD_VALUES.has(m)) as import("@/lib/ai/recommend-filters").Mood[];
    const moodExpanded = validMoods.length > 0
      ? expandMoods(validMoods, rawGenres, rawExcludeGenres)
      : { genres: rawGenres, excludeGenres: rawExcludeGenres };
    const genres: string[] = moodExpanded.genres;
    const excludeGenres: string[] = moodExpanded.excludeGenres;
    const page: number = body.page ?? 1;
    const userSort: string = body.sort ?? "match";
    const mediaType: string = body.mediaType ?? "any";
    const providerIds: number[] = body.providers ?? [];

    // Parents-guide severity caps (optional). Shape mirrors collection AI.
    const SEVERITY_VALUES = ["none", "mild", "mild-moderate", "moderate", "moderate-severe", "severe"];
    function validSeverity(v: unknown): string | null {
      return typeof v === "string" && SEVERITY_VALUES.includes(v) ? v : null;
    }
    const severityCaps = {
      maxViolence: validSeverity(body.maxViolence),
      maxSexualContent: validSeverity(body.maxSexualContent),
      maxLanguageSubstance: validSeverity(body.maxLanguageSubstance),
      maxScaryIntense: validSeverity(body.maxScaryIntense),
      maxSensitiveThemes: validSeverity(body.maxSensitiveThemes),
      minViolence: validSeverity(body.minViolence),
      minSexualContent: validSeverity(body.minSexualContent),
      minLanguageSubstance: validSeverity(body.minLanguageSubstance),
      minScaryIntense: validSeverity(body.minScaryIntense),
      minSensitiveThemes: validSeverity(body.minSensitiveThemes),
    };
    const hasSeverityCap = Object.values(severityCaps).some((v) => v !== null);
    const hasMinCap = severityCaps.minViolence || severityCaps.minSexualContent || severityCaps.minLanguageSubstance || severityCaps.minScaryIntense || severityCaps.minSensitiveThemes;

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
    // Precise year range from AI overrides era buckets when set.
    if (precisePeriodFrom != null) yearFrom = String(precisePeriodFrom);
    if (precisePeriodTo != null) yearTo = String(precisePeriodTo);

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

    // Build shared params (era, runtime, providers). Genres are applied later by
    // tmdbGetGenreAware so 2+ selected genres can do an AND-first / OR-fallback pass.
    function buildBaseParams(sortBy: string, includeKeywords = true): Record<string, string> {
      const p: Record<string, string> = { page: String(actualPage), sort_by: sortBy };
      if (excludeIds.length > 0) p.without_genres = excludeIds.join(",");
      if (yearFrom) p[isTV ? "first_air_date.gte" : "primary_release_date.gte"] = `${yearFrom}-01-01`;
      if (yearTo) p[isTV ? "first_air_date.lte" : "primary_release_date.lte"] = `${yearTo}-12-31`;
      if (providerIds.length > 0) { p.with_watch_providers = providerIds.join("|"); p.watch_region = "US"; }
      // TMDB native include-language (only supports a single code). Multi-code
      // whitelists fall back to a post-filter pass later. Passing the first
      // code here narrows the query server-side for the common single-language
      // case (e.g. "Korean thrillers" → ko).
      if (originalLanguageArr.length === 1) p.with_original_language = originalLanguageArr[0];
      // Min-rating floor via vote_average.gte (only when user explicitly set).
      if (minRatingNum != null) p["vote_average.gte"] = String(minRatingNum);
      // Keyword tags for niche themes (future, time loop, christmas, etc.).
      // Toggled off by the fallback pass below when the keyword query is sparse.
      if (includeKeywords && keywordsParam) p.with_keywords = keywordsParam;
      return p;
    }

    // With 2+ genres, surface all-genre matches first, then OR-matching titles
    // sorted by *how many* of the selected genres they hit. With 4 genres a
    // movie matching 3 beats one matching only 2, which beats one matching 1.
    async function tmdbGetGenreAware(endpoint: string, params: Record<string, string>) {
      // Translate movie genre IDs → TV genre IDs when hitting /discover/tv
      const effectiveGenreIds = endpoint === "/discover/tv" ? translateGenresForTV(genreIds) : genreIds;
      if (effectiveGenreIds.length === 0) {
        // If all requested genres are movie-only (e.g. Romance for TV), skip the TV call
        return genreIds.length > 0 ? { results: [], total_pages: 0 } : tmdbGet(endpoint, params);
      }
      if (effectiveGenreIds.length === 1) {
        return tmdbGet(endpoint, { ...params, with_genres: effectiveGenreIds[0] });
      }
      const andParams = { ...params, with_genres: effectiveGenreIds.join(",") };
      const orParams = { ...params, with_genres: effectiveGenreIds.join("|") };
      const [andRes, orRes] = await Promise.all([
        tmdbGet(endpoint, andParams).catch(() => null),
        tmdbGet(endpoint, orParams).catch(() => null),
      ]);
      const andResults = (andRes?.results ?? []) as Record<string, unknown>[];
      const orResults = (orRes?.results ?? []) as Record<string, unknown>[];
      const andIds = new Set(andResults.map((r) => r.id));
      const orUnique = orResults.filter((r) => !andIds.has(r.id));

      // For 3+ genres, stable-sort OR-unique remainder by match count descending.
      if (effectiveGenreIds.length >= 3) {
        const selected = new Set(effectiveGenreIds.map(Number));
        const matchCount = (r: Record<string, unknown>) =>
          ((r.genre_ids as number[] | undefined) ?? []).filter((g) => selected.has(g)).length;
        const decorated = orUnique.map((r, i) => ({ r, i, m: matchCount(r) }));
        decorated.sort((a, b) => b.m - a.m || a.i - b.i);
        orUnique.length = 0;
        for (const d of decorated) orUnique.push(d.r);
      }

      return {
        results: [...andResults, ...orUnique],
        total_pages: Math.max(andRes?.total_pages ?? 1, orRes?.total_pages ?? 1),
      };
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

    async function fetchForExperience(exp: string, includeKeywords = true): Promise<{ results: Record<string, unknown>[]; total_pages: number }> {
      const config = EXPERIENCE_PARAMS[exp] ?? { sort: "popularity.desc", params: { "vote_count.gte": "10" } };
      const p = { ...buildBaseParams(config.sort, includeKeywords), ...config.params };
      Object.assign(p, runtimeParams);
      applyUserSort(p);
      const tvP = buildTvParams(p);

      if (isBoth) {
        const [mv, tv] = await Promise.all([tmdbGetGenreAware("/discover/movie", p), tmdbGetGenreAware("/discover/tv", tvP)]);
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
      const raw = await tmdbGetGenreAware(endpoint, fetchP);
      return {
        results: (raw?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: isTV ? "tv" : "movie", _experience: exp })),
        total_pages: raw?.total_pages ?? 1,
      };
    }

    // ── Fetch results ──
    // Wrapped so we can re-run with keywords dropped as a fallback pass
    // when the keyword-constrained query is sparse.
    async function runMainFetch(includeKeywords: boolean): Promise<{ results: Record<string, unknown>[]; total_pages: number } | null> {
      if (experienceArr.length > 1) {
        const fetches = await Promise.all(experienceArr.map((exp) => fetchForExperience(exp, includeKeywords)));
        const merged: Record<string, unknown>[] = [];
        const cursors = fetches.map(() => 0);
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
        return { results: merged, total_pages: Math.max(...fetches.map((f) => f.total_pages)) };
      }
      if (experienceArr.length === 1) {
        const d = await fetchForExperience(experienceArr[0], includeKeywords);
        return { results: d.results.slice(0, 20), total_pages: d.total_pages };
      }
      const p = { ...buildBaseParams("popularity.desc", includeKeywords), "vote_count.gte": "10" };
      Object.assign(p, runtimeParams);
      applyUserSort(p);
      const tvP = buildTvParams(p);
      if (isBoth) {
        const [mv, tv] = await Promise.all([tmdbGetGenreAware("/discover/movie", p), tmdbGetGenreAware("/discover/tv", tvP)]);
        const mvR = (mv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "movie" }));
        const tvR = (tv?.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: "tv" }));
        const merged: Record<string, unknown>[] = [];
        let mi = 0, ti = 0;
        while (mi < mvR.length || ti < tvR.length) {
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (mi < mvR.length) merged.push(mvR[mi++]);
          if (ti < tvR.length) merged.push(tvR[ti++]);
        }
        return { results: merged.slice(0, 20), total_pages: Math.max(mv?.total_pages ?? 1, tv?.total_pages ?? 1) };
      }
      const endpoint = isTV ? "/discover/tv" : "/discover/movie";
      const fetchP = isTV ? tvP : p;
      const raw = await tmdbGetGenreAware(endpoint, fetchP);
      if (!raw) return null;
      return { results: (raw.results ?? []).map((r: Record<string, unknown>) => ({ ...r, _mediaType: isTV ? "tv" : "movie" })), total_pages: raw.total_pages ?? 1 };
    }

    let discoverData: { results: Record<string, unknown>[]; total_pages: number };
    const primary = await runMainFetch(true);
    if (!primary) return NextResponse.json({ error: "TMDB error" }, { status: 502 });
    discoverData = primary;
    // Keyword fallback: if the keyword-constrained pass produced fewer than
    // 10 titles, pad with no-keyword results (deduped, keyword-matched first).
    if (keywordsParam && discoverData.results.length < 10) {
      const fallback = await runMainFetch(false);
      if (fallback) {
        const seen = new Set(discoverData.results.map((r) => `${r._mediaType}:${r.id}`));
        for (const r of fallback.results) {
          const key = `${r._mediaType}:${r.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          discoverData.results.push(r);
          if (discoverData.results.length >= 20) break;
        }
        discoverData.total_pages = Math.max(discoverData.total_pages, fallback.total_pages);
      }
    }

    // ── Language + anime post-filter ──
    // TMDB's with_original_language only accepts one code, so multi-code
    // whitelists and all blacklists happen here. Anime exclusion is also a
    // compound filter (Japanese origin + Animation genre) that can't be
    // expressed via TMDB discover params.
    if (originalLanguageArr.length > 1 || excludeOriginalLanguagesArr.length > 0 || excludeAnimeFlag) {
      const whitelist = originalLanguageArr.length > 1 ? new Set(originalLanguageArr) : null;
      const blacklist = new Set(excludeOriginalLanguagesArr);
      const ANIMATION_GENRE_ID = 16;
      discoverData.results = discoverData.results.filter((m) => {
        const lang = (m.original_language as string | undefined) ?? "";
        const genreIdsArr = (m.genre_ids as number[] | undefined) ?? [];
        if (whitelist && !whitelist.has(lang)) return false;
        if (blacklist.has(lang)) return false;
        if (excludeAnimeFlag && lang === "ja" && genreIdsArr.includes(ANIMATION_GENRE_ID)) return false;
        return true;
      });
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
        stream: (us.flatrate ?? []).map((s: { provider_id: number; provider_name: string; logo_path: string }) => ({ name: s.provider_name, logo: s.logo_path, providerId: s.provider_id })).slice(0, 5),
        rent: (us.rent ?? []).map((s: { provider_id: number; provider_name: string; logo_path: string }) => ({ name: s.provider_name, logo: s.logo_path, providerId: s.provider_id })).slice(0, 3),
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

    // How many of the user's requested genres match this title's genre tags.
    // Client sorts by this first so an explicit "sci-fi + romance" query keeps
    // hybrid titles on top regardless of the user's personal taste profile.
    const requestedGenreIdSet = new Set(genreIds.map(Number));

    // Build results
    let results = (discoverData.results ?? []).map((m: Record<string, unknown>) => {
      const mt = m._mediaType as string;
      const itemGenreIds = (m.genre_ids as number[] | undefined) ?? [];
      const itemGenres = itemGenreIds.map((id) => idToName.get(id)).filter(Boolean) as string[];
      const details = detailsMap.get(m.id as number);
      const providers = providersMap.get(m.id as number);

      let matchScore: number | null = null;
      if (userGenrePrefs.size > 0 && itemGenres.length > 0) {
        const scores = itemGenres.map((g) => userGenrePrefs.get(g) ?? 0).filter((s) => s > 0);
        if (scores.length > 0) matchScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      const requestedMatchCount = requestedGenreIdSet.size > 0
        ? itemGenreIds.filter((g) => requestedGenreIdSet.has(g)).length
        : 0;

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
        requestedMatchCount,
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

    // Apply parents-guide severity caps (movies only; TV not tracked).
    if (hasSeverityCap) {
      const movieTmdbIds = results.filter((r: { mediaType: string }) => r.mediaType === "movie").map((r: { tmdbId: number }) => r.tmdbId);
      const cached = movieTmdbIds.length > 0
        ? await prisma.movieParentsGuide.findMany({ where: { tmdbId: { in: movieTmdbIds } } })
        : [];
      const cacheByTmdbId = new Map(cached.map((c) => [c.tmdbId, c]));
      const rank = (s: string) => SEVERITY_VALUES.indexOf(s);
      results = results.filter((r: { tmdbId: number; mediaType: string }) => {
        if (r.mediaType !== "movie") return true; // TV passes (no cache)
        const entry = cacheByTmdbId.get(r.tmdbId);
        // Max caps: uncached passes through. Min floors: uncached excluded.
        if (!entry) return !hasMinCap;
        const maxChecks: [string, string | null][] = [
          [entry.violenceSeverity, severityCaps.maxViolence],
          [entry.sexualSeverity, severityCaps.maxSexualContent],
          [entry.languageSubstanceSeverity, severityCaps.maxLanguageSubstance],
          [entry.scaryIntenseSeverity, severityCaps.maxScaryIntense],
          [entry.sensitiveThemesSeverity, severityCaps.maxSensitiveThemes],
        ];
        for (const [actual, cap] of maxChecks) {
          if (cap == null) continue;
          if (rank(actual) > rank(cap)) return false;
        }
        const minChecks: [string, string | null][] = [
          [entry.violenceSeverity, severityCaps.minViolence],
          [entry.sexualSeverity, severityCaps.minSexualContent],
          [entry.languageSubstanceSeverity, severityCaps.minLanguageSubstance],
          [entry.scaryIntenseSeverity, severityCaps.minScaryIntense],
          [entry.sensitiveThemesSeverity, severityCaps.minSensitiveThemes],
        ];
        for (const [actual, floor] of minChecks) {
          if (floor == null) continue;
          if (rank(actual) < rank(floor)) return false;
        }
        return true;
      });
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
