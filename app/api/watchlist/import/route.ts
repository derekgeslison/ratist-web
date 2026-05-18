import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { nextSortOrderForList } from "@/lib/watchlist-sort-order";

/**
 * Watchlist import endpoint. Accepts a batch of import rows from
 * either Letterboxd (CSV → { title, year }) or IMDb (List.json →
 * { imdbId }) and adds the resolved titles to the user's chosen
 * watchlist (default = their primary list).
 *
 * Resolution mirrors /api/import for ratings:
 *   - IMDb rows resolve via /find/<imdb_id> (works for movies + TV).
 *   - Letterboxd rows resolve via /search/movie with the year-exact
 *     match boost (Letterboxd's watchlist export is movies only).
 *
 * Dedupe is enforced at the join table: an already-on-list entry is
 * counted as "skipped" rather than "failed".
 */

interface ImportRow {
  title?: string;
  year?: number;
  imdbId?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBMovieResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
}

interface FindResult {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  mediaType: "movie" | "tv";
}

async function findByIMDbId(imdbId: string): Promise<FindResult | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${TMDB_BASE}/find/${imdbId}?api_key=${API_KEY}&external_source=imdb_id`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const movie = data.movie_results?.[0];
    if (movie) return { tmdbId: movie.id, title: movie.title, posterPath: movie.poster_path ?? null, releaseDate: movie.release_date ?? null, mediaType: "movie" };
    const show = data.tv_results?.[0];
    if (show) return { tmdbId: show.id, title: show.name, posterPath: show.poster_path ?? null, releaseDate: show.first_air_date ?? null, mediaType: "tv" };
    return null;
  } catch {
    return null;
  }
}

async function searchMovie(title: string, year?: number): Promise<FindResult | null> {
  if (!API_KEY) return null;
  const params = new URLSearchParams({ query: title, api_key: API_KEY, include_adult: "false" });
  if (year) params.set("year", String(year));
  try {
    const res = await fetch(`${TMDB_BASE}/search/movie?${params}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const results: TMDBMovieResult[] = data.results ?? [];
    if (results.length === 0) return null;

    // Year-exact + title-exact wins. Same heuristic as /api/import.
    // TMDB's `year` param is a popularity boost, not a hard filter, so
    // without this we'd happily pull in re-releases or unrelated titles
    // that happen to share a name.
    if (year) {
      const exact = results.find((r) => {
        const ry = r.release_date ? new Date(r.release_date).getFullYear() : null;
        return ry === year && r.title.toLowerCase() === title.toLowerCase();
      });
      if (exact) return { tmdbId: exact.id, title: exact.title, posterPath: exact.poster_path, releaseDate: exact.release_date, mediaType: "movie" };

      const yearMatch = results.find((r) => {
        const ry = r.release_date ? new Date(r.release_date).getFullYear() : null;
        return ry === year;
      });
      if (yearMatch) return { tmdbId: yearMatch.id, title: yearMatch.title, posterPath: yearMatch.poster_path, releaseDate: yearMatch.release_date, mediaType: "movie" };
    }

    const top = results[0];
    return { tmdbId: top.id, title: top.title, posterPath: top.poster_path, releaseDate: top.release_date, mediaType: "movie" };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json() as { rows?: ImportRow[]; listId?: string };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, failed: 0, errors: [] });
    }

    // Destination is REQUIRED — imports never fall back to the user's
    // default watchlist or their add-position settings. The user must
    // explicitly pick a target list (or create one) in the UI before
    // we run anything. Guards against accidentally dumping hundreds of
    // titles into the wrong list because a setting was on.
    if (typeof body.listId !== "string" || body.listId.length === 0) {
      return NextResponse.json({ error: "listId is required — pick a watchlist to import into" }, { status: 400 });
    }
    const wl = await prisma.watchlist.findUnique({
      where: { id: body.listId },
      include: { collaborators: { where: { userId: user.id } } },
    });
    if (!wl) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    const isOwner = wl.userId === user.id;
    const isEditor = wl.collaborators.some((c) => c.role === "editor" && c.status === "accepted");
    if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const watchlistId = wl.id;

    const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

    for (const row of rows) {
      // Resolution path: IMDb id first (most reliable), then title + year.
      let resolved: FindResult | null = null;
      if (row.imdbId && row.imdbId.startsWith("tt")) {
        resolved = await findByIMDbId(row.imdbId);
      } else if (row.title) {
        resolved = await searchMovie(row.title, row.year);
      }

      if (!resolved) {
        result.failed++;
        const label = row.title ?? row.imdbId ?? "(unknown)";
        result.errors.push(label + (row.year ? ` (${row.year})` : ""));
        continue;
      }

      try {
        if (resolved.mediaType === "tv") {
          const show = await prisma.tVShow.upsert({
            where: { tmdbId: resolved.tmdbId },
            create: { tmdbId: resolved.tmdbId, name: resolved.title, posterPath: resolved.posterPath, firstAirDate: resolved.releaseDate },
            update: {},
          });
          const existing = await prisma.watchlistShow.findUnique({
            where: { watchlistId_tvShowId: { watchlistId, tvShowId: show.id } },
          });
          if (existing) { result.skipped++; continue; }
          const sortOrder = await nextSortOrderForList(watchlistId, user.watchlistAddPosition);
          await prisma.watchlistShow.create({ data: { watchlistId, tvShowId: show.id, sortOrder, addedById: user.id } });
          result.imported++;
        } else {
          const movie = await prisma.movie.upsert({
            where: { tmdbId: resolved.tmdbId },
            create: { tmdbId: resolved.tmdbId, title: resolved.title, posterPath: resolved.posterPath, releaseDate: resolved.releaseDate },
            update: {},
          });
          const existing = await prisma.watchlistMovie.findUnique({
            where: { watchlistId_movieId: { watchlistId, movieId: movie.id } },
          });
          if (existing) { result.skipped++; continue; }
          const sortOrder = await nextSortOrderForList(watchlistId, user.watchlistAddPosition);
          await prisma.watchlistMovie.create({ data: { watchlistId, movieId: movie.id, sortOrder, addedById: user.id } });
          result.imported++;
        }
      } catch (err) {
        result.failed++;
        const label = resolved.title;
        result.errors.push(`${label}: ${err instanceof Error ? err.message : "DB error"}`);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Watchlist import error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
