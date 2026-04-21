import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { extractCollectionFilters, SEVERITY_ORDER, type Severity } from "@/lib/ai/collection-filters";
import { checkAiRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { discoverMovies, getGenres, getShowGenres, type TMDBMovie, type TMDBShow } from "@/lib/tmdb";

// Returns true if title passes all severity caps.
// Uncached titles pass through (coverage is partial).
function passesSeverityCaps(
  cache: { violenceSeverity: string; sexualSeverity: string; languageSubstanceSeverity: string; scaryIntenseSeverity: string; sensitiveThemesSeverity: string } | undefined,
  caps: { maxViolence: Severity | null; maxSexualContent: Severity | null; maxLanguageSubstance: Severity | null; maxScaryIntense: Severity | null; maxSensitiveThemes: Severity | null },
): boolean {
  if (!cache) return true;
  const rank = (s: string) => (SEVERITY_ORDER as readonly string[]).indexOf(s);
  const checks: [string, Severity | null][] = [
    [cache.violenceSeverity, caps.maxViolence],
    [cache.sexualSeverity, caps.maxSexualContent],
    [cache.languageSubstanceSeverity, caps.maxLanguageSubstance],
    [cache.scaryIntenseSeverity, caps.maxScaryIntense],
    [cache.sensitiveThemesSeverity, caps.maxSensitiveThemes],
  ];
  for (const [actual, cap] of checks) {
    if (cap == null) continue;
    if (rank(actual) > rank(cap)) return false;
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
  const url = new URL("https://api.themoviedb.org/3/discover/tv");
  url.searchParams.set("api_key", process.env.TMDB_API_KEY ?? "0a8b11e67dd3e6ee739bb736777f4695");
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

  const rateLimitError = await checkAiRateLimit(user, "collection", 10);
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  try {
    const filters = await extractCollectionFilters(prompt);
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

    // ── seen_only mode: skip TMDB entirely, query user's own seen list from DB ──
    type Item = { mediaType: "movie" | "tv"; tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null };
    if (filters.seenFilter === "seen_only" && !useTv) {
      const includeIdsNum = includeIds.map(Number);
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
        take: filters.limit,
      });
      const collectedSeen: Item[] = seenRows.map((r) => ({
        mediaType: "movie" as const,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        releaseDate: r.movie.releaseDate,
        voteAverage: r.movie.voteAverage,
      }));
      await logAiUsage(user.id, "collection");
      return NextResponse.json({ filters, items: collectedSeen });
    }

    // Build user's seen-TMDB-IDs set when we need to EXCLUDE seen (unseen mode)
    let seenTmdbIds = new Set<number>();
    if (filters.seenFilter === "unseen" && !useTv) {
      const seen = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { tmdbId: true } } },
      });
      seenTmdbIds = new Set(seen.map((s) => s.movie.tmdbId));
    }

    // Severity caps require a bulk cache lookup at the end. Collect a larger
    // candidate pool when any cap is set so filtering still leaves enough items.
    const hasSeverityCap = filters.maxViolence || filters.maxSexualContent || filters.maxLanguageSubstance || filters.maxScaryIntense || filters.maxSensitiveThemes;
    const targetPool = hasSeverityCap ? filters.limit * 3 : filters.limit;

    // Paginate through TMDB discover until we have `targetPool` items or exhaust pages (cap at 5 pages)
    const collected: Item[] = [];
    const maxPages = 5;
    let page = 1;
    while (collected.length < targetPool && page <= maxPages) {
      if (useTv) {
        const data = await discoverTvShows({
          genreIds: includeIds.length ? includeIds : undefined,
          yearFrom: filters.yearFrom,
          yearTo: filters.yearTo,
          ratingGte: filters.minRating,
          page,
        });
        for (const s of data.results) {
          const sGenreIds = (s as TMDBShow & { genre_ids?: number[] }).genre_ids;
          if (excludeIds.length > 0 && sGenreIds?.some((id) => excludeIds.includes(id))) continue;
          if (collected.some((c) => c.tmdbId === s.id && c.mediaType === "tv")) continue;
          collected.push({
            mediaType: "tv",
            tmdbId: s.id,
            title: s.name,
            posterPath: s.poster_path ?? null,
            releaseDate: s.first_air_date ?? null,
            voteAverage: s.vote_average ?? null,
          });
          if (collected.length >= targetPool) break;
        }
        if (data.page >= data.total_pages || data.results.length === 0) break;
        page++;
      } else {
        const data = await discoverMovies({
          genres: includeIds.length ? includeIds : undefined,
          genreMode: "any",
          query: filters.textQuery ?? undefined,
          yearFrom: filters.yearFrom != null ? String(filters.yearFrom) : undefined,
          yearTo: filters.yearTo != null ? String(filters.yearTo) : undefined,
          ratingGte: filters.minRating != null ? String(filters.minRating) : undefined,
          sort: "top_rated",
          page,
        });
        for (const m of data.results) {
          const mGenreIds = (m as TMDBMovie & { genre_ids?: number[] }).genre_ids;
          if (excludeIds.length > 0 && mGenreIds?.some((id) => excludeIds.includes(id))) continue;
          if (seenTmdbIds.has(m.id)) continue;
          if (collected.some((c) => c.tmdbId === m.id && c.mediaType === "movie")) continue;
          collected.push({
            mediaType: "movie",
            tmdbId: m.id,
            title: m.title,
            posterPath: m.poster_path ?? null,
            releaseDate: m.release_date ?? null,
            voteAverage: m.vote_average ?? null,
          });
          if (collected.length >= targetPool) break;
        }
        if (data.page >= data.total_pages) break;
        page++;
      }
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
        });
      });
    }

    finalItems = finalItems.slice(0, filters.limit);

    await logAiUsage(user.id, "collection");

    return NextResponse.json({ filters, items: finalItems });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`AI collection — Anthropic error ${err.status}:`, err.message);
      return NextResponse.json({ error: `AI error (${err.status}): ${err.message}` }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("AI collection error:", message, err);
    return NextResponse.json({ error: `Collection generation failed: ${message}` }, { status: 500 });
  }
}
