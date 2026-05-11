import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getGenres, getShowGenres } from "@/lib/tmdb";
import { expandMoods } from "@/lib/ai/mood-expand";
import { resolveKeywords } from "@/lib/tmdb-keywords";
import { resolveCast } from "@/lib/tmdb-cast";
import { resolveStudioNames } from "@/lib/studios";
import { loadGroupMembers, loadGroupSeenSets, computeGroupScore, MAX_GROUP_SIZE, type MemberPrefs } from "@/lib/recommend-group";
import { predictRatingsBatch } from "@/lib/collection-match";
import { genrePrefsScore, getBatchScoreEstimates, getBatchScoreEstimatesTv } from "@/lib/profile";

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
  // Merge movie + TV genre lists. nameToId uses the movie IDs for the
  // genres the user selects (e.g. "Action" → 28); idToName covers IDs from
  // both sides so TV responses can still display "Action & Adventure" /
  // "Sci-Fi & Fantasy" / "War & Politics" even though those IDs don't
  // exist in the movie genre list.
  const [movieData, tvData] = await Promise.all([getGenres(), getShowGenres()]);
  genreCache = new Map(movieData.genres.map((g) => [g.name, g.id]));
  genreIdToName = new Map();
  for (const g of movieData.genres) genreIdToName.set(g.id, g.name);
  for (const g of tvData.genres) if (!genreIdToName.has(g.id)) genreIdToName.set(g.id, g.name);
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
    const excludeKeywordPhrases: string[] = Array.isArray(body.excludeKeywords)
      ? body.excludeKeywords.filter((k: unknown): k is string => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase()).slice(0, 3)
      : [];
    const excludeKeywordIds = excludeKeywordPhrases.length > 0 ? await resolveKeywords(excludeKeywordPhrases) : [];
    const excludeKeywordsParam = excludeKeywordIds.length > 0 ? excludeKeywordIds.join("|") : undefined;
    const studioNames: string[] = Array.isArray(body.studios)
      ? body.studios.filter((s: unknown): s is string => typeof s === "string")
      : [];
    const studioIds = studioNames.length > 0 ? resolveStudioNames(studioNames) : [];
    const companiesParam = studioIds.length > 0 ? studioIds.join("|") : undefined;
    const castPhrases: string[] = Array.isArray(body.cast)
      ? body.cast.filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0).map((n: string) => n.trim()).slice(0, 3)
      : [];
    const castIds = castPhrases.length > 0 ? await resolveCast(castPhrases) : [];
    const castParam = castIds.length > 0 ? castIds.join(",") : undefined;

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

    // ── Group mode (memberUids = firebaseUids of friends to score with) ──
    // When provided + the requester is signed in, swap the matchScore
    // computation for floor + groupScore across all members and the
    // unseen filter for the union of seen/rated across the group.
    const memberFirebaseUids: string[] = Array.isArray(body.memberUids)
      ? body.memberUids.filter((u: unknown): u is string => typeof u === "string")
      : [];
    // Default OFF — most group sessions are fine letting one or two
    // members rewatch. Strict mode is the opt-in for "must be unseen
    // for everyone."
    const excludeAnyMemberSeen: boolean = body.excludeAnyMemberSeen === true;
    const isGroupMode = !!user && memberFirebaseUids.length > 0;
    let groupMembers: MemberPrefs[] = [];
    let groupSeen: { movieTmdbIds: Set<number>; tvTmdbIds: Set<number> } = { movieTmdbIds: new Set(), tvTmdbIds: new Set() };
    if (isGroupMode && user) {
      if (memberFirebaseUids.length > MAX_GROUP_SIZE - 1) {
        return NextResponse.json(
          { error: `Group is capped at ${MAX_GROUP_SIZE} members (you plus ${MAX_GROUP_SIZE - 1} others).` },
          { status: 400 },
        );
      }
      // firebaseUid → internal id, excluding self if accidentally passed,
      // soft-deleted, and banned users.
      const others = await prisma.user.findMany({
        where: {
          firebaseUid: { in: memberFirebaseUids },
          deletedAt: null,
          bannedAt: null,
          id: { not: user.id },
        },
        select: { id: true },
      });
      const allMemberIds = [user.id, ...others.map((u) => u.id)];
      // Only fetch the union seen set when the strict flag is on. Loose
      // mode reuses the solo per-user lookup further below, so there's
      // no point doing the heavier multi-user query.
      [groupMembers, groupSeen] = await Promise.all([
        loadGroupMembers(allMemberIds),
        excludeAnyMemberSeen
          ? loadGroupSeenSets(allMemberIds)
          : Promise.resolve({ movieTmdbIds: new Set<number>(), tvTmdbIds: new Set<number>() }),
      ]);
    }

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

    // ── Taste-only mode: DB-backed path ──
    // When the user picks "Based on your taste" as the SOLE experience,
    // we bypass TMDB Discover entirely and query our own Movie/TVShow
    // tables. The prior flow (TMDB → predict → filter) only ever scored
    // popular-by-TMDB titles, so high-match items from our database that
    // weren't currently trending on TMDB never surfaced. Taste mode is
    // explicitly an "of everything I haven't seen, what's the best fit
    // for me?" question — which is a DB-side problem.
    //
    // Restricted to single-experience taste because the other
    // experiences (classic / hidden gem / popular) have meaningful
    // intent baked into their TMDB query params and shouldn't be
    // subsumed by this path.
    const isTasteOnly = experienceArr.length === 1 && experienceArr[0] === "taste" && !isGroupMode && !!user;
    if (isTasteOnly && user) {
      const taste = await runTasteOnlyMode({
        userId: user.id,
        mediaType,
        genreIdNums: genreIds.map(Number),
        excludeGenreIdNums: excludeIds.map(Number),
        yearFrom: yearFrom || null,
        yearTo: yearTo || null,
        runtimeArr,
        minRatingNum,
        originalLanguageArr,
        excludeOriginalLanguagesArr,
        page,
      });
      return NextResponse.json(taste);
    }
    // Random page (1-10) when no experience is selected, so refreshing the
    // tool shuffles in fresh titles instead of always showing the same TMDB
    // page 1. EXCEPT when 2+ genres are selected — multi-genre AND-first
    // matching only has data on the first page or two for narrow combos
    // (Action+SciFi+Romance is sparse), so randomizing to page 5+ surfaces
    // an empty AND query and the user only sees 1-of-N OR matches.
    // Keeping page deterministic for multi-genre queries preserves the
    // tiering: all-match → most-match → least-match.
    const shouldRandomize = experienceArr.length === 0 && genreIds.length <= 1;
    const actualPage = shouldRandomize ? Math.floor(Math.random() * 10) + 1 : page;

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
      // Negative keywords always apply (we don't fall back on them — exclusion
      // is the user's intent, not a "if results are sparse" hint).
      if (excludeKeywordsParam) p.without_keywords = excludeKeywordsParam;
      // Studio filter — TMDB with_companies. Pipe-joined for OR semantics.
      if (companiesParam) p.with_companies = companiesParam;
      // Cast filter — TMDB /discover/movie supports with_cast (actors only).
      // On /discover/tv this param is ignored; TV results won't be narrowed
      // by actor but won't crash.
      if (castParam) p.with_cast = castParam;
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

    // Solo-mode matching no longer uses raw genre prefs — replaced by
    // predictRatingsBatch below (full-taste-profile prediction grounded
    // in community ratings). Group mode still uses per-member genre
    // prefs via loadGroupMembers / computeGroupScore.

    // How many of the user's requested genres match this title's genre tags.
    // Client sorts by this first so an explicit "sci-fi + romance" query keeps
    // hybrid titles on top regardless of the user's personal taste profile.
    const requestedGenreIdSet = new Set(genreIds.map(Number));

    // Predicted ratings for solo mode. Uses the same engine as
    // community-collections match — full taste profile (components +
    // genres + your rating patterns) grounded in community ratings.
    // Returns null per item when the title isn't in our DB or there's
    // insufficient data. Skipped in group mode (which uses
    // computeGroupScore's per-member floor) and for unauthed visitors.
    let predictionMap = new Map<string, number | null>();
    // The user's profile is also fetched so we can fall back to a
    // genre-prefs-only score when the prediction engine returns null
    // (movie not in our DB, no community ratings, or community ratings
    // are all quick and have no sub-field data). Without this fallback
    // the match-percent badge silently disappeared for ~all results.
    let soloProfile: Record<string, unknown> | null = null;
    if (!isGroupMode && user) {
      const predItems = (discoverData.results ?? []).map((m: Record<string, unknown>) => ({
        tmdbId: m.id as number,
        mediaType: m._mediaType as "movie" | "tv",
      }));
      const [predRes, profileRes] = await Promise.all([
        predictRatingsBatch(user.id, predItems).catch((err) => {
          console.error("[recommend] predictRatingsBatch failed; falling back to genre prefs:", err);
          return new Map<string, number | null>();
        }),
        prisma.userProfile.findUnique({ where: { userId: user.id } }).catch(() => null),
      ]);
      predictionMap = predRes;
      soloProfile = profileRes as Record<string, unknown> | null;
    }

    // Build results
    let results = (discoverData.results ?? []).map((m: Record<string, unknown>) => {
      const mt = m._mediaType as string;
      const itemGenreIds = (m.genre_ids as number[] | undefined) ?? [];
      const itemGenres = itemGenreIds.map((id) => idToName.get(id)).filter(Boolean) as string[];
      const details = detailsMap.get(m.id as number);
      const providers = providersMap.get(m.id as number);

      // matchScore semantics:
      //   solo  → predicted 1-10 rating from full taste profile (null
      //           when title isn't in our DB or there's not enough
      //           community data to predict).
      //   group → floor (worst per-member 0-10) so the existing client
      //           sort by matchScore desc keeps "everyone tolerates this"
      //           on top. Per-member detail rides along separately.
      let matchScore: number | null = null;
      let floor: number | null = null;
      let groupScore: number | null = null;
      let perMemberScores: { firebaseUid: string; name: string; avatarUrl: string | null; score: number | null }[] | undefined;

      if (isGroupMode && groupMembers.length > 0) {
        const g = computeGroupScore(groupMembers, itemGenres);
        floor = g.floor;
        groupScore = g.groupScore;
        perMemberScores = g.perMember;
        matchScore = g.floor; // mirror floor for client sort + badge
      } else if (user) {
        const pred = predictionMap.get(`${mt}-${m.id}`);
        if (pred != null) {
          matchScore = Math.round(pred * 10) / 10;
        } else if (soloProfile) {
          // Genre-prefs fallback. Keeps the badge meaningful when the
          // prediction engine can't run (movie not in our DB / community
          // ratings are all quick / etc).
          const fallback = genrePrefsScore(soloProfile, itemGenreIds);
          if (fallback != null) matchScore = Math.round(fallback * 10) / 10;
        }
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
        floor,
        groupScore,
        perMemberScores,
        requestedMatchCount,
        reason: (m._experience as string)
          ? getReasonForExperience(m._experience as string)
          : getReasonForResult(experienceArr, m.vote_average as number, m.vote_count as number, m.popularity as number, matchScore),
      };
    });

    // "Based on your taste" — sort by match score desc, prefer items
    // above a 50% floor, but never let the floor return zero results.
    // Without this, the experience just adds a quality floor to the
    // TMDB query (vote_count >= 50, vote_average >= 6) and surfaces
    // whatever's popular regardless of taste fit — users were seeing
    // 18% / 34% matches in a feature literally called "based on your
    // taste". The 50% floor drops those; the top-5 safety net handles
    // genre-narrow queries (e.g. Action+War for a viewer whose War
    // prefs are mid-low) where strict filtering would leave nothing.
    // Group mode is its own thing; unauthed visitors have no profile.
    if (experienceArr.includes("taste") && !isGroupMode && user) {
      const MATCH_FLOOR = 5.0;
      results.sort((a: { matchScore: number | null }, b: { matchScore: number | null }) =>
        (b.matchScore ?? -1) - (a.matchScore ?? -1),
      );
      const aboveFloor = results.filter((r: { matchScore: number | null }) => (r.matchScore ?? -1) >= MATCH_FLOOR);
      results = aboveFloor.length >= 3 ? aboveFloor : results.slice(0, 5);
    }

    // Exclude seen/rated content. Three cases:
    //   group + strict → union across all members (loadGroupSeenSets)
    //   group + loose  → just the requesting user (parity with solo —
    //                    skipping your own seen is uncontroversial)
    //   solo           → just the requesting user
    if (isGroupMode && excludeAnyMemberSeen) {
      results = results.filter((r: { tmdbId: number; mediaType: string }) =>
        r.mediaType === "tv" ? !groupSeen.tvTmdbIds.has(r.tmdbId) : !groupSeen.movieTmdbIds.has(r.tmdbId)
      );
    } else if (user) {
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

// ──────────────────────────────────────────────────────────────────────
// Taste-only mode: query our own DB for unseen titles with community
// data, predict scores, return top matches. Replaces the TMDB Discover
// path entirely for single-experience "taste" requests.
//
// Returns up to 20 results in the same shape the client already
// expects (matching MovieResult on the page). Genre/era/runtime/MPAA
// filters apply via Prisma. Streaming-provider filtering is skipped in
// this path — TMDB Discover does that natively but our cached
// watchProviders is sparse; users can still see provider info on the
// detail page. Severity caps + keyword filters are likewise skipped in
// v1; if users miss them in taste mode we'll wire them up here.
// ──────────────────────────────────────────────────────────────────────

interface TasteParams {
  userId: string;
  mediaType: string;
  genreIdNums: number[];
  excludeGenreIdNums: number[];
  yearFrom: string | null;
  yearTo: string | null;
  runtimeArr: string[];
  minRatingNum: number | null;
  originalLanguageArr: string[];
  excludeOriginalLanguagesArr: string[];
  page: number;
}

const TASTE_PAGE_SIZE = 20;
const TASTE_CANDIDATE_POOL = 500; // per media type

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

async function runTasteOnlyMode(p: TasteParams) {
  const isTV = p.mediaType === "tv";
  const isBoth = p.mediaType === "any";
  const wantMovies = !isTV;
  const wantShows = isTV || isBoth;

  // Build runtime range — movies and TV episodes use different scales.
  let movieRuntimeMin: number | undefined;
  let movieRuntimeMax: number | undefined;
  let tvRuntimeMin: number | undefined;
  let tvRuntimeMax: number | undefined;
  if (p.runtimeArr.length > 0 && !p.runtimeArr.includes("")) {
    const hasShort = p.runtimeArr.includes("short");
    const hasStandard = p.runtimeArr.includes("standard");
    const hasLong = p.runtimeArr.includes("long");
    if (hasShort && !hasStandard && !hasLong) movieRuntimeMax = 100;
    else if (!hasShort && hasStandard && !hasLong) { movieRuntimeMin = 90; movieRuntimeMax = 140; }
    else if (!hasShort && !hasStandard && hasLong) movieRuntimeMin = 150;
    else if (hasShort && hasStandard && !hasLong) movieRuntimeMax = 140;
    else if (!hasShort && hasStandard && hasLong) movieRuntimeMin = 90;
    const hasShortEp = p.runtimeArr.includes("short_ep");
    const hasStdEp = p.runtimeArr.includes("standard_ep");
    const hasLongEp = p.runtimeArr.includes("long_ep");
    if (hasShortEp && !hasStdEp && !hasLongEp) tvRuntimeMax = 35;
    else if (!hasShortEp && hasStdEp && !hasLongEp) { tvRuntimeMin = 35; tvRuntimeMax = 65; }
    else if (!hasShortEp && !hasStdEp && hasLongEp) tvRuntimeMin = 55;
    else if (hasShortEp && hasStdEp && !hasLongEp) tvRuntimeMax = 65;
    else if (!hasShortEp && hasStdEp && hasLongEp) tvRuntimeMin = 35;
  }

  // Exclude sets — seen + rated, per media type.
  const [seenMovies, ratedMovies, seenShows, ratedShows] = await Promise.all([
    wantMovies ? prisma.userFavoriteMovie.findMany({ where: { userId: p.userId }, select: { movieId: true } }) : Promise.resolve([]),
    wantMovies ? prisma.movieRating.findMany({ where: { userId: p.userId }, select: { movieId: true } }) : Promise.resolve([]),
    wantShows ? prisma.userFavoriteShow.findMany({ where: { userId: p.userId }, select: { tvShowId: true } }) : Promise.resolve([]),
    wantShows ? prisma.tVShowRating.findMany({ where: { userId: p.userId }, select: { tvShowId: true } }) : Promise.resolve([]),
  ]);
  const excludeMovieIds = Array.from(new Set([
    ...(seenMovies as { movieId: string }[]).map((x) => x.movieId),
    ...(ratedMovies as { movieId: string }[]).map((x) => x.movieId),
  ]));
  const excludeShowIds = Array.from(new Set([
    ...(seenShows as { tvShowId: string }[]).map((x) => x.tvShowId),
    ...(ratedShows as { tvShowId: string }[]).map((x) => x.tvShowId),
  ]));

  const voteFloor = p.minRatingNum != null ? p.minRatingNum : 6;

  // Build queries. Both share most filters; differences are
  // releaseDate vs firstAirDate, runtime vs episodeRunTime, etc.
  // Using AnyRecord for the where clause because Prisma's generated
  // types here would balloon this file without adding safety.
  const movieWhere: AnyRecord = {
    voteAverage: { gte: voteFloor },
    voteCount: { gte: 50 },
    ratings: { some: { excluded: false, ratistRating: { not: null } } },
  };
  if (excludeMovieIds.length > 0) movieWhere.id = { notIn: excludeMovieIds };
  if (p.genreIdNums.length > 0) movieWhere.genres = { some: { genreId: { in: p.genreIdNums } } };
  if (p.excludeGenreIdNums.length > 0) movieWhere.NOT = { genres: { some: { genreId: { in: p.excludeGenreIdNums } } } };
  const movieDateRange: AnyRecord = {};
  if (p.yearFrom) movieDateRange.gte = `${p.yearFrom}-01-01`;
  if (p.yearTo) movieDateRange.lte = `${p.yearTo}-12-31`;
  if (Object.keys(movieDateRange).length > 0) movieWhere.releaseDate = movieDateRange;
  const movieRuntimeRange: AnyRecord = {};
  if (movieRuntimeMin != null) movieRuntimeRange.gte = movieRuntimeMin;
  if (movieRuntimeMax != null) movieRuntimeRange.lte = movieRuntimeMax;
  if (Object.keys(movieRuntimeRange).length > 0) movieWhere.runtime = movieRuntimeRange;
  if (p.originalLanguageArr.length > 0) movieWhere.originalLanguage = { in: p.originalLanguageArr };
  if (p.excludeOriginalLanguagesArr.length > 0) {
    movieWhere.originalLanguage = movieWhere.originalLanguage
      ? { ...movieWhere.originalLanguage, notIn: p.excludeOriginalLanguagesArr }
      : { notIn: p.excludeOriginalLanguagesArr };
  }

  const showWhere: AnyRecord = {
    voteAverage: { gte: voteFloor },
    voteCount: { gte: 50 },
    ratings: { some: { excluded: false, ratistRating: { not: null }, ratingScope: "series" } },
  };
  if (excludeShowIds.length > 0) showWhere.id = { notIn: excludeShowIds };
  // Map movie genre IDs → TV genre IDs (same translation the TMDB path uses)
  if (p.genreIdNums.length > 0) {
    const tvIds = translateGenresForTV(p.genreIdNums.map(String)).map(Number);
    if (tvIds.length > 0) showWhere.genres = { some: { genreId: { in: tvIds } } };
  }
  if (p.excludeGenreIdNums.length > 0) {
    const tvExcludeIds = translateGenresForTV(p.excludeGenreIdNums.map(String)).map(Number);
    if (tvExcludeIds.length > 0) showWhere.NOT = { genres: { some: { genreId: { in: tvExcludeIds } } } };
  }
  const showDateRange: AnyRecord = {};
  if (p.yearFrom) showDateRange.gte = `${p.yearFrom}-01-01`;
  if (p.yearTo) showDateRange.lte = `${p.yearTo}-12-31`;
  if (Object.keys(showDateRange).length > 0) showWhere.firstAirDate = showDateRange;
  const showRuntimeRange: AnyRecord = {};
  if (tvRuntimeMin != null) showRuntimeRange.gte = tvRuntimeMin;
  if (tvRuntimeMax != null) showRuntimeRange.lte = tvRuntimeMax;
  if (Object.keys(showRuntimeRange).length > 0) showWhere.episodeRunTime = showRuntimeRange;

  // Fat candidate pools — TASTE_CANDIDATE_POOL each — so the
  // predict-then-rank pass has enough material to fill several pages,
  // even for genre-narrow queries. Shuffle/load-more navigate pages.
  const [candidateMovies, candidateShows, tasteProfile] = await Promise.all([
    wantMovies
      ? prisma.movie.findMany({
          where: movieWhere,
          take: TASTE_CANDIDATE_POOL,
          orderBy: { popularity: "desc" },
          include: { genres: { include: { genre: true } } },
        })
      : Promise.resolve([]),
    wantShows
      ? prisma.tVShow.findMany({
          where: showWhere,
          take: TASTE_CANDIDATE_POOL,
          orderBy: { popularity: "desc" },
          include: { genres: { include: { genre: true } } },
        })
      : Promise.resolve([]),
    prisma.userProfile.findUnique({ where: { userId: p.userId } }),
  ]);

  const [moviePreds, showPreds] = await Promise.all([
    candidateMovies.length > 0
      ? getBatchScoreEstimates(p.userId, candidateMovies.map((m) => m.id))
      : Promise.resolve(new Map<string, number | null>()),
    candidateShows.length > 0
      ? getBatchScoreEstimatesTv(p.userId, candidateShows.map((s) => s.id))
      : Promise.resolve(new Map<string, number | null>()),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const m of candidateMovies) {
    let matchScore: number | null = null;
    const pred = moviePreds.get(m.id);
    if (pred != null) {
      matchScore = Math.round(pred * 10) / 10;
    } else if (tasteProfile) {
      const tmdbGenreIds = m.genres.map((g) => g.genreId);
      const fallback = genrePrefsScore(tasteProfile as unknown as Record<string, unknown>, tmdbGenreIds);
      if (fallback != null) matchScore = Math.round(fallback * 10) / 10;
    }
    if (matchScore == null) continue;
    // requestedMatchCount = 0 uniformly. The client's match-mode sort
    // (page.tsx) tiers by requestedMatchCount first then matchScore —
    // useful in TMDB mode where multi-genre matches earn priority, but
    // in taste mode it creates a jarring 88 → 60s → 80+ order because
    // 2-genre matches at 60% cluster above 1-genre matches at 80%.
    // Forcing uniform 0 lets the client's sort fall through to
    // matchScore desc, which mirrors our server-side ranking.
    results.push({
      tmdbId: m.tmdbId,
      title: m.title,
      posterPath: m.posterPath,
      year: (m.releaseDate ?? "").slice(0, 4),
      overview: m.overview ?? "",
      voteAverage: m.voteAverage ?? 0,
      popularity: m.popularity ?? 0,
      genres: m.genres.map((g) => g.genre.name),
      runtime: m.runtime,
      mpaaRating: m.mpaaRating,
      mediaType: "movie",
      streaming: [],
      rentBuy: [],
      matchScore,
      floor: null,
      groupScore: null,
      perMemberScores: undefined,
      requestedMatchCount: 0,
      reason: "Based on your taste",
    });
  }

  for (const s of candidateShows) {
    let matchScore: number | null = null;
    const pred = showPreds.get(s.id);
    if (pred != null) {
      matchScore = Math.round(pred * 10) / 10;
    } else if (tasteProfile) {
      const tmdbGenreIds = s.genres.map((g) => g.genreId);
      const fallback = genrePrefsScore(tasteProfile as unknown as Record<string, unknown>, tmdbGenreIds);
      if (fallback != null) matchScore = Math.round(fallback * 10) / 10;
    }
    if (matchScore == null) continue;
    results.push({
      tmdbId: s.tmdbId,
      title: s.name,
      posterPath: s.posterPath,
      year: (s.firstAirDate ?? "").slice(0, 4),
      overview: s.overview ?? "",
      voteAverage: s.voteAverage ?? 0,
      popularity: s.popularity ?? 0,
      genres: s.genres.map((g) => g.genre.name),
      runtime: s.episodeRunTime,
      mpaaRating: s.contentRating,
      mediaType: "tv",
      streaming: [],
      rentBuy: [],
      matchScore,
      floor: null,
      groupScore: null,
      perMemberScores: undefined,
      requestedMatchCount: 0,
      reason: "Based on your taste",
    });
  }

  // Sort by predicted score desc.
  results.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  // Floor totalPages at 3 so the Shuffle button — which fetches
  // Math.random() * min(totalPages, 20) — always has somewhere to land.
  // Even when our scored pool only fills one page deterministically,
  // shuffle pages exist as randomized re-samples (see below).
  const totalPages = Math.max(3, Math.ceil(results.length / TASTE_PAGE_SIZE));
  const page = Math.max(1, Math.min(p.page || 1, totalPages));

  // Page 1: deterministic top N by score — the user always sees their
  // best matches first when they run the query fresh.
  if (page === 1) {
    return {
      results: results.slice(0, TASTE_PAGE_SIZE),
      totalPages,
      page,
    };
  }

  // Page 2+: shuffle path. Pull a random sample of TASTE_PAGE_SIZE
  // from the scored pool, then re-sort the sample by score so the
  // user still sees its best entries first. Subsequent shuffles
  // produce different random subsets — variety without lowering the
  // overall quality bar.
  const pool = [...results];
  const sample: typeof pool = [];
  for (let i = 0; i < TASTE_PAGE_SIZE && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    sample.push(pool.splice(idx, 1)[0]);
  }
  sample.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  return { results: sample, totalPages, page };
}
