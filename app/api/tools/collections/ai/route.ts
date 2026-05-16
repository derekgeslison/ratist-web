import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { sanitizeAiError } from "@/lib/ai/sanitize-error";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { extractCollectionFilters, SEVERITY_ORDER, type Severity } from "@/lib/ai/collection-filters";
import { expandMoods } from "@/lib/ai/mood-expand";
import { checkAndLogAiToolsRateLimit, RateLimitError } from "@/lib/ai/rate-limit";
import { discoverMovies, getGenres, getShowGenres, type TMDBMovie, type TMDBShow } from "@/lib/tmdb";
import { resolveKeywords } from "@/lib/tmdb-keywords";
import { resolveCast } from "@/lib/tmdb-cast";
import { resolveStudioNames } from "@/lib/studios";
import { resolveTitles } from "@/lib/ai/title-resolver";

interface SeverityCaps {
  maxViolence: Severity | null; maxSexualContent: Severity | null; maxLanguageSubstance: Severity | null; maxScaryIntense: Severity | null; maxSensitiveThemes: Severity | null;
  minViolence: Severity | null; minSexualContent: Severity | null; minLanguageSubstance: Severity | null; minScaryIntense: Severity | null; minSensitiveThemes: Severity | null;
}

// Returns true if the title passes all severity caps.
// - Max caps (safety): uncached titles PASS THROUGH (we can't prove they're too extreme, so include by default).
// - Min caps (preference): uncached titles are EXCLUDED (we can't confirm they meet the floor user wants).
function passesSeverityCaps(
  cache: { violenceSeverity: string; sexualSeverity: string; languageSubstanceSeverity: string; scaryIntenseSeverity: string; sensitiveThemesSeverity: string } | undefined,
  caps: SeverityCaps,
): boolean {
  const hasMin = caps.minViolence || caps.minSexualContent || caps.minLanguageSubstance || caps.minScaryIntense || caps.minSensitiveThemes;
  if (!cache) return !hasMin; // uncached → pass only if no min-floor is set
  const rank = (s: string) => (SEVERITY_ORDER as readonly string[]).indexOf(s);
  const maxChecks: [string, Severity | null][] = [
    [cache.violenceSeverity, caps.maxViolence],
    [cache.sexualSeverity, caps.maxSexualContent],
    [cache.languageSubstanceSeverity, caps.maxLanguageSubstance],
    [cache.scaryIntenseSeverity, caps.maxScaryIntense],
    [cache.sensitiveThemesSeverity, caps.maxSensitiveThemes],
  ];
  for (const [actual, cap] of maxChecks) {
    if (cap == null) continue;
    if (rank(actual) > rank(cap)) return false;
  }
  const minChecks: [string, Severity | null][] = [
    [cache.violenceSeverity, caps.minViolence],
    [cache.sexualSeverity, caps.minSexualContent],
    [cache.languageSubstanceSeverity, caps.minLanguageSubstance],
    [cache.scaryIntenseSeverity, caps.minScaryIntense],
    [cache.sensitiveThemesSeverity, caps.minSensitiveThemes],
  ];
  for (const [actual, floor] of minChecks) {
    if (floor == null) continue;
    if (rank(actual) < rank(floor)) return false;
  }
  return true;
}

export const dynamic = "force-dynamic";

// Movie-genre names → TV-genre names (TMDB groups some TV genres differently)
const MOVIE_TO_TV_GENRE: Record<string, string> = {
  "Science Fiction": "Sci-Fi & Fantasy",
  "Fantasy": "Sci-Fi & Fantasy",
  "Action": "Action & Adventure",
  "Adventure": "Action & Adventure",
  "War": "War & Politics",
};

async function discoverTvShows(params: {
  genreIds?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  ratingGte?: number | null;
  originalLanguage?: string | null;
  keywords?: string | null;
  excludeKeywords?: string | null;
  companies?: string | null;
  page?: number;
}): Promise<{ results: TMDBShow[]; page: number; total_pages: number }> {
  const qp: Record<string, string> = {
    page: String(params.page ?? 1),
    sort_by: "vote_average.desc",
    "vote_count.gte": "50",
  };
  if (params.genreIds?.length) qp.with_genres = params.genreIds.join("|");
  if (params.yearFrom) qp["first_air_date.gte"] = `${params.yearFrom}-01-01`;
  if (params.yearTo) qp["first_air_date.lte"] = `${params.yearTo}-12-31`;
  if (params.ratingGte != null) qp["vote_average.gte"] = String(params.ratingGte);
  if (params.originalLanguage) qp.with_original_language = params.originalLanguage;
  if (params.keywords) qp.with_keywords = params.keywords;
  if (params.excludeKeywords) qp.without_keywords = params.excludeKeywords;
  if (params.companies) qp.with_companies = params.companies;
  const url = new URL("https://api.themoviedb.org/3/discover/tv");
  // No hardcoded fallback — if TMDB_API_KEY is missing, fail loud
  // rather than silently sharing a leaked key from git history.
  if (!process.env.TMDB_API_KEY) throw new Error("TMDB_API_KEY env var is not set");
  url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(qp)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) return { results: [], page: 1, total_pages: 0 };
  return res.json();
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to use AI collections" }, { status: 401 });

  // Backstage Pass gate (admins bypass)
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json({ error: "AI collections are a Backstage Pass feature." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 5) {
    return NextResponse.json({ error: "Describe the collection you want in a few words" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return NextResponse.json({ error: "Prompt is too long (max 500 characters)" }, { status: 400 });
  }

  try {
    await checkAndLogAiToolsRateLimit(user, "collection");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.userMessage }, { status: 429 });
    }
    throw err;
  }

  try {
    const rawFilters = await extractCollectionFilters(prompt);
    // Expand hidden mood tags into genre adds / avoids before resolving IDs.
    const moodExpanded = expandMoods(rawFilters.moods, rawFilters.genres, rawFilters.excludeGenres);
    const filters = { ...rawFilters, genres: moodExpanded.genres, excludeGenres: moodExpanded.excludeGenres };
    const useTv = filters.mediaType === "tv";

    // Map genre names to TMDB IDs (movie vs TV genre sets)
    const movieGenres = await getGenres();
    const movieNameToId = new Map(movieGenres.genres.map((g) => [g.name, g.id]));

    let includeIds: string[] = [];
    let excludeIds: number[] = [];
    if (useTv) {
      const tvGenres = await getShowGenres();
      const tvNameToId = new Map(tvGenres.genres.map((g) => [g.name, g.id]));
      // Map movie-genre names the AI picked to TV-genre equivalents, then dedupe
      const tvNames = new Set<string>();
      for (const g of filters.genres) {
        tvNames.add(MOVIE_TO_TV_GENRE[g] ?? g);
      }
      includeIds = [...tvNames].map((n) => tvNameToId.get(n)).filter((id): id is number => id != null).map(String);
      const tvExcludeNames = new Set<string>();
      for (const g of filters.excludeGenres) tvExcludeNames.add(MOVIE_TO_TV_GENRE[g] ?? g);
      excludeIds = [...tvExcludeNames].map((n) => tvNameToId.get(n)).filter((id): id is number => id != null);
    } else {
      includeIds = filters.genres.map((g) => movieNameToId.get(g)).filter((id): id is number => id != null).map(String);
      excludeIds = filters.excludeGenres.map((g) => movieNameToId.get(g)).filter((id): id is number => id != null);
    }

    // genreMatchCount tracks how many of the user's selected genres this title
    // actually has — used to preserve AND-first ordering through the shuffle.
    type Item = { mediaType: "movie" | "tv"; tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; genreMatchCount: number };

    // ── Build comprehensive seen sets (movies + shows, favorites + ratings) ──
    // Used by BOTH the AI-title pre-filter below and the existing TMDB
    // discover-loop's seen filter. "Seen" = either marked as seen
    // (UserFavoriteMovie/Show) or rated (MovieRating/TVShowRating).
    let seenMovieIdsAll = new Set<number>();
    let seenShowIdsAll = new Set<number>();
    if (filters.seenFilter !== "any") {
      const [movFavs, movRatings, showFavs, showRatings] = await Promise.all([
        prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }),
        prisma.movieRating.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }),
        prisma.userFavoriteShow.findMany({ where: { userId: user.id }, select: { tvShow: { select: { tmdbId: true } } } }),
        prisma.tVShowRating.findMany({ where: { userId: user.id }, select: { tvShow: { select: { tmdbId: true } } } }),
      ]);
      seenMovieIdsAll = new Set([
        ...movFavs.map((s) => s.movie.tmdbId),
        ...movRatings.map((s) => s.movie.tmdbId),
      ]);
      seenShowIdsAll = new Set([
        ...showFavs.map((s) => s.tvShow.tmdbId),
        ...showRatings.map((s) => s.tvShow.tmdbId),
      ]);
    }

    // ── Hybrid step: resolve AI's curated title picks against TMDB ──
    // The AI returns 10-20 specific titles for vibe/curation prompts that
    // filter discovery can't capture ("cult classic comedies", "Almost
    // Famous-style"). We resolve each to a TMDB id, apply the user's seen
    // preference + excludeGenres + year window, and seed the collected
    // pool. Filter-based discovery below pads any remaining slots.
    const movieIncludedIdSetAll = new Set(includeIds.map(Number));
    async function buildAiSeeds(): Promise<Item[]> {
      if (filters.titles.length === 0) return [];
      const resolved = await resolveTitles(filters.titles);
      const seeds: Item[] = [];
      const wantedMediaType: "movie" | "tv" | null = useTv ? "tv" : (filters.mediaType === "any" ? null : "movie");
      for (const r of resolved) {
        if (wantedMediaType !== null && r.mediaType !== wantedMediaType) continue;
        const seenSet = r.mediaType === "tv" ? seenShowIdsAll : seenMovieIdsAll;
        if (filters.seenFilter === "unseen" && seenSet.has(r.tmdbId)) continue;
        if (filters.seenFilter === "seen_only" && !seenSet.has(r.tmdbId)) continue;
        if (excludeIds.length > 0 && r.genreIds.some((id) => excludeIds.includes(id))) continue;
        const itemYear = r.releaseDate ? parseInt(r.releaseDate.slice(0, 4), 10) : null;
        if (filters.yearFrom != null && itemYear != null && itemYear < filters.yearFrom) continue;
        if (filters.yearTo != null && itemYear != null && itemYear > filters.yearTo) continue;
        seeds.push({
          mediaType: r.mediaType,
          tmdbId: r.tmdbId,
          title: r.title,
          posterPath: r.posterPath,
          releaseDate: r.releaseDate,
          voteAverage: r.voteAverage,
          genreMatchCount: r.mediaType === "movie"
            ? r.genreIds.filter((g) => movieIncludedIdSetAll.has(g)).length
            : 0,
        });
      }
      return seeds;
    }
    const aiSeeds = await buildAiSeeds();
    // Track AI-seed identity so the tier-shuffle below preserves AI order.
    const aiSeedKeys = new Set(aiSeeds.map((s) => `${s.mediaType}:${s.tmdbId}`));

    // ── seen_only mode: skip TMDB entirely, query user's own seen list from DB ──
    if (filters.seenFilter === "seen_only" && !useTv) {
      const includeIdsNum = includeIds.map(Number);
      // Fetch a bigger quality-filtered pool, then randomly sample so repeat
      // prompts don't yield the identical list every time.
      const poolSize = Math.max(filters.limit * 5, 50);
      const seenRows = await prisma.userFavoriteMovie.findMany({
        where: {
          userId: user.id,
          movie: {
            ...(filters.minRating != null ? { voteAverage: { gte: filters.minRating } } : {}),
            ...(filters.yearFrom != null ? { releaseDate: { gte: `${filters.yearFrom}-01-01` } } : {}),
            ...(filters.yearTo != null ? { releaseDate: { lte: `${filters.yearTo}-12-31` } } : {}),
            ...(includeIdsNum.length > 0
              ? { genres: { some: { genreId: { in: includeIdsNum } } } }
              : {}),
            ...(excludeIds.length > 0
              ? { genres: { none: { genreId: { in: excludeIds } } } }
              : {}),
          },
        },
        select: {
          movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
        },
        orderBy: { movie: { voteAverage: "desc" } },
        take: poolSize,
      });
      // Fisher-Yates shuffle the DB-discovered pool — repeat prompts get
      // variety in the filler. AI-resolved seeds (already filtered to the
      // user's seen set above) take precedence and stay in AI-ranked order.
      const shuffled = [...seenRows];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const dbSeenItems: Item[] = shuffled
        .filter((r) => !aiSeedKeys.has(`movie:${r.movie.tmdbId}`))
        .map((r) => ({
          mediaType: "movie" as const,
          tmdbId: r.movie.tmdbId,
          title: r.movie.title,
          posterPath: r.movie.posterPath,
          releaseDate: r.movie.releaseDate,
          voteAverage: r.movie.voteAverage,
          genreMatchCount: 0, // not tracked for seen_only — DB filter already enforces genres
        }));
      const collectedSeen: Item[] = [...aiSeeds, ...dbSeenItems].slice(0, filters.limit);
      // Usage already logged atomically at start of route.
      return NextResponse.json({ filters, items: collectedSeen });
    }

    // Movie-only seen-IDs alias for the existing collectLoop (which only
    // checks movies, not shows). The comprehensive seen sets built above
    // include both, but the loop's predicate only references this one.
    const seenTmdbIds = filters.seenFilter === "unseen" && !useTv ? seenMovieIdsAll : new Set<number>();

    // Severity caps require a bulk cache lookup at the end. Collect a larger
    // candidate pool when any cap is set so filtering still leaves enough items.
    // Min caps exclude uncached titles, so bump the pool even more aggressively.
    const hasMaxCap = filters.maxViolence || filters.maxSexualContent || filters.maxLanguageSubstance || filters.maxScaryIntense || filters.maxSensitiveThemes;
    const hasMinCap = filters.minViolence || filters.minSexualContent || filters.minLanguageSubstance || filters.minScaryIntense || filters.minSensitiveThemes;
    const hasSeverityCap = hasMaxCap || hasMinCap;
    // Always overshoot so the end-of-flow shuffle yields variety on repeat
    // prompts. Severity caps need an even bigger pool to survive filtering.
    const targetPool = hasMinCap ? filters.limit * 5 : hasMaxCap ? filters.limit * 3 : filters.limit * 3;

    // Multi-genre handling: when 2+ genres are selected, fetch AND-match
    // results first (titles matching ALL selected genres) then OR-match
    // (titles matching any) so hybrids like "sci-fi + romance" surface on top.
    // Translate runtime buckets to minutes. Buckets stack: if the user picks
    // multiple, we take the widest span (gte from lowest bucket, lte from
    // highest). Empty array → no runtime constraint.
    const runtimeMins = (() => {
      if (!filters.runtime.length) return { min: undefined as number | undefined, max: undefined as number | undefined };
      const spans: Record<string, [number | undefined, number | undefined]> = {
        short: [undefined, 89],
        feature: [90, 120],
        long: [120, 150],
        epic: [150, undefined],
      };
      let min: number | undefined;
      let max: number | undefined;
      for (const r of filters.runtime) {
        const span = spans[r];
        if (!span) continue;
        if (span[0] != null) min = Math.min(min ?? span[0], span[0]);
        if (span[1] != null) max = Math.max(max ?? span[1], span[1]);
      }
      // If user picked only upper-bucket (e.g. "epic" only) there's no max;
      // if only "short", there's no min — both valid.
      return { min, max };
    })();
    // TMDB with_original_language only accepts one code, so we pass the
    // first whitelist entry (if exactly one) to narrow the query server-side.
    // Multi-entry whitelists and all blacklists run as post-filters below.
    const tmdbLangCode = filters.originalLanguage.length === 1 ? filters.originalLanguage[0] : undefined;

    // Resolve keyword phrases → TMDB keyword IDs. OR semantics (pipe) so any
    // matching keyword qualifies. If resolution fails or yields nothing, we
    // just don't constrain by keyword.
    const keywordIds = await resolveKeywords(filters.keywords);
    const keywordsParam = keywordIds.length > 0 ? keywordIds.join("|") : undefined;

    // Same for negative keyword phrases. TMDB without_keywords ORs the IDs
    // so any single keyword match excludes the title.
    const excludeKeywordIds = filters.excludeKeywords.length > 0 ? await resolveKeywords(filters.excludeKeywords) : [];
    const excludeKeywordsParam = excludeKeywordIds.length > 0 ? excludeKeywordIds.join("|") : undefined;

    // Resolve cast names to TMDB person IDs (actors only — director prompts
    // may resolve to the person but TMDB /discover can't filter by director).
    const castIds = filters.cast.length > 0 ? await resolveCast(filters.cast) : [];
    const castIdsStr = castIds.length > 0 ? castIds.map(String) : undefined;

    // Resolve studio names → TMDB company IDs. Pipe-joined for OR semantics
    // (a film need only be from one of the selected studios to qualify).
    const studioIds = resolveStudioNames(filters.studios);
    const companiesParam = studioIds.length > 0 ? studioIds.map(String) : undefined;

    // Split MPAA array: movie certifications pass to TMDB /discover/movie
    // via `certification`. TV ratings (TV-*) aren't supported by /discover/tv
    // — they'd need a post-filter via content_ratings lookup (skipped).
    const MOVIE_CERTS = new Set(["G", "PG", "PG-13", "R", "NC-17"]);
    const movieCertifications = filters.mpaaRatings.filter((r) => MOVIE_CERTS.has(r));
    const movieCertsParam = movieCertifications.length > 0 ? movieCertifications : undefined;

    async function discoverAndOr(page: number, genreIds: string[], useKeywords: boolean) {
      const kw = useKeywords ? keywordsParam : undefined;
      if (genreIds.length <= 1) {
        return discoverMovies({
          genres: genreIds.length ? genreIds : undefined,
          genreMode: "any",
          query: filters.textQuery ?? undefined,
          certifications: movieCertsParam,
          castIds: castIdsStr,
          companies: companiesParam,
          yearFrom: filters.yearFrom != null ? String(filters.yearFrom) : undefined,
          yearTo: filters.yearTo != null ? String(filters.yearTo) : undefined,
          ratingGte: filters.minRating != null ? String(filters.minRating) : undefined,
          language: tmdbLangCode,
          keywords: kw,
          excludeKeywords: excludeKeywordsParam,
          minRuntime: runtimeMins.min,
          maxRuntime: runtimeMins.max,
          sort: "top_rated",
          page,
        });
      }
      const [andRes, orRes] = await Promise.all([
        discoverMovies({
          genres: genreIds,
          genreMode: "all",
          query: filters.textQuery ?? undefined,
          certifications: movieCertsParam,
          castIds: castIdsStr,
          companies: companiesParam,
          yearFrom: filters.yearFrom != null ? String(filters.yearFrom) : undefined,
          yearTo: filters.yearTo != null ? String(filters.yearTo) : undefined,
          ratingGte: filters.minRating != null ? String(filters.minRating) : undefined,
          language: tmdbLangCode,
          keywords: kw,
          excludeKeywords: excludeKeywordsParam,
          minRuntime: runtimeMins.min,
          maxRuntime: runtimeMins.max,
          sort: "top_rated",
          page,
        }).catch(() => null),
        discoverMovies({
          genres: genreIds,
          genreMode: "any",
          query: filters.textQuery ?? undefined,
          certifications: movieCertsParam,
          castIds: castIdsStr,
          companies: companiesParam,
          yearFrom: filters.yearFrom != null ? String(filters.yearFrom) : undefined,
          yearTo: filters.yearTo != null ? String(filters.yearTo) : undefined,
          ratingGte: filters.minRating != null ? String(filters.minRating) : undefined,
          language: tmdbLangCode,
          keywords: kw,
          excludeKeywords: excludeKeywordsParam,
          minRuntime: runtimeMins.min,
          maxRuntime: runtimeMins.max,
          sort: "top_rated",
          page,
        }).catch(() => null),
      ]);
      const andResults = andRes?.results ?? [];
      const orResults = orRes?.results ?? [];
      const andIds = new Set(andResults.map((r) => r.id));
      const orUnique = orResults.filter((r) => !andIds.has(r.id));
      // For 3+ genres, stable-sort OR-unique by how many of the selected genres match
      if (genreIds.length >= 3) {
        const selected = new Set(genreIds.map(Number));
        const matchCount = (r: TMDBMovie & { genre_ids?: number[] }) =>
          (r.genre_ids ?? []).filter((g) => selected.has(g)).length;
        const decorated = orUnique.map((r, i) => ({ r, i, m: matchCount(r as TMDBMovie & { genre_ids?: number[] }) }));
        decorated.sort((a, b) => b.m - a.m || a.i - b.i);
        orUnique.length = 0;
        for (const d of decorated) orUnique.push(d.r);
      }
      return {
        results: [...andResults, ...orUnique],
        page,
        total_pages: Math.max(andRes?.total_pages ?? 1, orRes?.total_pages ?? 1),
      };
    }

    // Language/anime post-filters applied inline during result ingestion.
    const langWhitelist = filters.originalLanguage.length > 1 ? new Set(filters.originalLanguage) : null;
    const langBlacklist = new Set(filters.excludeOriginalLanguages);
    const ANIMATION_GENRE_ID = 16;
    const passesLang = (lang: string, genreIdsArr: number[]) => {
      if (langWhitelist && !langWhitelist.has(lang)) return false;
      if (langBlacklist.has(lang)) return false;
      if (filters.excludeAnime && lang === "ja" && genreIdsArr.includes(ANIMATION_GENRE_ID)) return false;
      return true;
    };

    // Paginate through TMDB discover until we have `targetPool` items or exhaust pages (cap at 5 pages).
    // Factored as a reusable loop so we can run a no-keyword fallback pass
    // when the keyword query yields too few hits. Pre-seeded with the AI's
    // resolved title picks so the curation flows in front of discovery.
    const collected: Item[] = [...aiSeeds];
    const maxPages = 5;
    async function collectLoop(useKeywords: boolean) {
      let page = 1;
      while (collected.length < targetPool && page <= maxPages) {
        if (useTv) {
          const data = await discoverTvShows({
            genreIds: includeIds.length ? includeIds : undefined,
            yearFrom: filters.yearFrom,
            yearTo: filters.yearTo,
            ratingGte: filters.minRating,
            originalLanguage: tmdbLangCode,
            keywords: useKeywords ? keywordsParam : undefined,
            excludeKeywords: excludeKeywordsParam,
            companies: studioIds.length > 0 ? studioIds.join("|") : undefined,
            page,
          });
          const includedIdSet = new Set(includeIds.map(Number));
          for (const s of data.results) {
            const sGenreIds = (s as TMDBShow & { genre_ids?: number[] }).genre_ids ?? [];
            if (excludeIds.length > 0 && sGenreIds.some((id) => excludeIds.includes(id))) continue;
            if (!passesLang((s as TMDBShow & { original_language?: string }).original_language ?? "", sGenreIds)) continue;
            if (collected.some((c) => c.tmdbId === s.id && c.mediaType === "tv")) continue;
            collected.push({
              mediaType: "tv",
              tmdbId: s.id,
              title: s.name,
              posterPath: s.poster_path ?? null,
              releaseDate: s.first_air_date ?? null,
              voteAverage: s.vote_average ?? null,
              genreMatchCount: sGenreIds.filter((g) => includedIdSet.has(g)).length,
            });
            if (collected.length >= targetPool) break;
          }
          if (data.page >= data.total_pages || data.results.length === 0) break;
          page++;
        } else {
          const data = await discoverAndOr(page, includeIds, useKeywords);
          const movieIncludedIdSet = new Set(includeIds.map(Number));
          for (const m of data.results) {
            const mGenreIds = (m as TMDBMovie & { genre_ids?: number[] }).genre_ids ?? [];
            if (excludeIds.length > 0 && mGenreIds.some((id) => excludeIds.includes(id))) continue;
            if (!passesLang((m as TMDBMovie & { original_language?: string }).original_language ?? "", mGenreIds)) continue;
            if (seenTmdbIds.has(m.id)) continue;
            if (collected.some((c) => c.tmdbId === m.id && c.mediaType === "movie")) continue;
            collected.push({
              mediaType: "movie",
              tmdbId: m.id,
              title: m.title,
              posterPath: m.poster_path ?? null,
              releaseDate: m.release_date ?? null,
              voteAverage: m.vote_average ?? null,
              genreMatchCount: mGenreIds.filter((g) => movieIncludedIdSet.has(g)).length,
            });
            if (collected.length >= targetPool) break;
          }
          if (data.page >= data.total_pages) break;
          page++;
        }
      }
    }

    await collectLoop(true);
    // Fallback: if the keyword-constrained pass yielded too few matches, run
    // a second pass with keywords dropped to pad the pool. Keyword-matched
    // results stay first because they were collected first.
    const fallbackThreshold = Math.ceil(filters.limit * 0.6);
    if (keywordsParam && collected.length < fallbackThreshold) {
      await collectLoop(false);
    }

    // Apply parents-guide severity caps via cache lookup (movies only).
    let finalItems = collected;
    if (hasSeverityCap && !useTv) {
      const tmdbIds = collected.map((c) => c.tmdbId);
      const cached = await prisma.movieParentsGuide.findMany({
        where: { tmdbId: { in: tmdbIds } },
      });
      const cacheByTmdbId = new Map(cached.map((c) => [c.tmdbId, c]));
      finalItems = collected.filter((c) => {
        const entry = cacheByTmdbId.get(c.tmdbId);
        return passesSeverityCaps(entry, {
          maxViolence: filters.maxViolence,
          maxSexualContent: filters.maxSexualContent,
          maxLanguageSubstance: filters.maxLanguageSubstance,
          maxScaryIntense: filters.maxScaryIntense,
          maxSensitiveThemes: filters.maxSensitiveThemes,
          minViolence: filters.minViolence,
          minSexualContent: filters.minSexualContent,
          minLanguageSubstance: filters.minLanguageSubstance,
          minScaryIntense: filters.minScaryIntense,
          minSensitiveThemes: filters.minSensitiveThemes,
        });
      });
    }

    // Split into AI-seeds (preserve curation order) and discover-pool
    // (tier-shuffle for variety). AI seeds always come first; the AI ranked
    // them in its own preferred order and shuffling would dilute that.
    // Discovered items still tier-shuffle so repeat prompts give variety in
    // the filler and 2-of-2 genre matches still beat 1-of-2.
    const aiSeedSurvivors = finalItems.filter((c) => aiSeedKeys.has(`${c.mediaType}:${c.tmdbId}`));
    const discoverPool = finalItems.filter((c) => !aiSeedKeys.has(`${c.mediaType}:${c.tmdbId}`));
    const tiers = new Map<number, Item[]>();
    for (const item of discoverPool) {
      const t = item.genreMatchCount;
      if (!tiers.has(t)) tiers.set(t, []);
      tiers.get(t)!.push(item);
    }
    const tierKeys = [...tiers.keys()].sort((a, b) => b - a); // highest match first
    const tiered: Item[] = [];
    for (const k of tierKeys) {
      const group = tiers.get(k)!;
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      tiered.push(...group);
    }
    finalItems = [...aiSeedSurvivors, ...tiered].slice(0, filters.limit);

    // Usage already logged atomically at start of route.
    return NextResponse.json({ filters, items: finalItems });
  } catch (err) {
    const { status, body: errBody } = sanitizeAiError(err, "collections");
    return NextResponse.json(errBody, { status });
  }
}
