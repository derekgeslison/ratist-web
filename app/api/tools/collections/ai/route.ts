import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { extractCollectionFilters } from "@/lib/ai/collection-filters";
import { checkAiRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { discoverMovies, getGenres, type TMDBMovie } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

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

    // Map genre names to TMDB IDs
    const { genres: allGenres } = await getGenres();
    const nameToId = new Map(allGenres.map((g) => [g.name, g.id]));
    const includeIds = filters.genres.map((g) => nameToId.get(g)).filter((id): id is number => id != null).map(String);
    const excludeIds = filters.excludeGenres.map((g) => nameToId.get(g)).filter((id): id is number => id != null);

    // Build user's seen-TMDB-IDs set if excludeSeen is on
    let seenTmdbIds = new Set<number>();
    if (filters.excludeSeen) {
      const seen = await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { tmdbId: true } } },
      });
      seenTmdbIds = new Set(seen.map((s) => s.movie.tmdbId));
    }

    // Paginate through TMDB discover until we have `limit` items or exhaust pages (cap at 5 pages)
    const collected: TMDBMovie[] = [];
    const maxPages = 5;
    let page = 1;
    while (collected.length < filters.limit && page <= maxPages) {
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
        // Skip excluded genres
        if (excludeIds.length > 0 && mGenreIds?.some((id) => excludeIds.includes(id))) continue;
        if (seenTmdbIds.has(m.id)) continue;
        if (collected.some((c) => c.id === m.id)) continue;
        collected.push(m);
        if (collected.length >= filters.limit) break;
      }
      if (data.page >= data.total_pages) break;
      page++;
    }

    await logAiUsage(user.id, "collection");

    return NextResponse.json({
      filters,
      items: collected.map((m) => ({
        mediaType: "movie" as const,
        tmdbId: m.id,
        title: m.title,
        posterPath: m.poster_path ?? null,
        releaseDate: m.release_date ?? null,
        voteAverage: m.vote_average ?? null,
      })),
    });
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
