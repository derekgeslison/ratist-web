import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { rebuildUserProfile } from "@/lib/profile";

interface ImportRow {
  title: string;
  year?: number;
  rating?: number; // already normalized to 1-10
  review?: string;
  imdbId?: string;
  watchedDate?: string;
  isRewatch?: boolean;
}

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBSearchResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  genre_ids: number[];
}

interface TMDBMovieDetail {
  id: number;
  runtime: number | null;
  vote_average: number | null;
}

async function findByIMDbId(imdbId: string): Promise<TMDBSearchResult | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${TMDB_BASE}/find/${imdbId}?api_key=${API_KEY}&external_source=imdb_id`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const movie = data.movie_results?.[0];
    if (movie) return { id: movie.id, title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date, genre_ids: movie.genre_ids ?? [] };
    // Could also be a TV show — skip for now (import is movie-focused)
    return null;
  } catch {
    return null;
  }
}

async function searchTMDB(title: string, year?: number): Promise<TMDBSearchResult | null> {
  if (!API_KEY) return null;
  const params = new URLSearchParams({ query: title, api_key: API_KEY, include_adult: "false" });
  if (year) params.set("year", String(year));
  try {
    const res = await fetch(`${TMDB_BASE}/search/movie?${params}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchTMDBDetails(tmdbId: number): Promise<TMDBMovieDetail | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${API_KEY}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// TMDB genre ID → Genre name mapping
const TMDB_GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { rows, source }: { rows: ImportRow[]; source: string } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Search TMDB — prefer IMDb ID lookup, fall back to title search
        const tmdbResult = row.imdbId
          ? await findByIMDbId(row.imdbId) ?? await searchTMDB(row.title, row.year)
          : await searchTMDB(row.title, row.year);
        if (!tmdbResult) {
          failed++;
          errors.push(`Not found: "${row.imdbId ?? row.title}" (${row.year ?? "unknown year"})`);
          continue;
        }

        // Fetch runtime from TMDB details
        const details = await fetchTMDBDetails(tmdbResult.id);

        // Upsert movie with runtime + voteAverage
        const movie = await prisma.movie.upsert({
          where: { tmdbId: tmdbResult.id },
          create: {
            tmdbId: tmdbResult.id,
            title: tmdbResult.title,
            posterPath: tmdbResult.poster_path,
            releaseDate: tmdbResult.release_date,
            runtime: details?.runtime ?? null,
            voteAverage: details?.vote_average ?? null,
          },
          update: {
            ...(tmdbResult.poster_path ? { posterPath: tmdbResult.poster_path } : {}),
            ...(tmdbResult.release_date ? { releaseDate: tmdbResult.release_date } : {}),
            ...(details?.runtime ? { runtime: details.runtime } : {}),
            ...(details?.vote_average ? { voteAverage: details.vote_average } : {}),
          },
        });

        // Upsert genres from search result genre_ids
        if (tmdbResult.genre_ids?.length > 0) {
          for (const genreId of tmdbResult.genre_ids) {
            const genreName = TMDB_GENRE_NAMES[genreId];
            if (!genreName) continue;
            // Ensure genre exists
            await prisma.genre.upsert({
              where: { id: genreId },
              create: { id: genreId, name: genreName },
              update: {},
            });
            // Link movie ↔ genre
            await prisma.movieGenre.upsert({
              where: { movieId_genreId: { movieId: movie.id, genreId } },
              create: { movieId: movie.id, genreId },
              update: {},
            });
          }
        }

        // Compute watched date early (needed for both rewatch and normal flow)
        const watchedAt = row.watchedDate ? new Date(`${row.watchedDate}T12:00:00`) : new Date();

        // If this is a rewatch entry, just log it and continue
        if (row.isRewatch) {
          await prisma.userWatchLog.create({
            data: {
              userId: user.id,
              movieId: movie.id,
              watchedDate: watchedAt,
              notes: row.review?.trim() || null,
              isRewatch: true,
            },
          }).catch(() => {}); // ignore duplicate
          imported++;
          continue;
        }

        // Check if user already has a COMPLETE rating — skip if so
        const existingRating = await prisma.movieRating.findUnique({
          where: { userId_movieId: { userId: user.id, movieId: movie.id } },
          select: { id: true, plot: true },
        });
        if (existingRating?.plot != null) {
          skipped++;
          continue;
        }

        // Mark as seen
        await prisma.userFavoriteMovie.upsert({
          where: { userId_movieId: { userId: user.id, movieId: movie.id } },
          create: { userId: user.id, movieId: movie.id, watchedDate: watchedAt },
          update: { ...(row.watchedDate ? { watchedDate: watchedAt } : {}) },
        });

        // Create/update rating — set both overallRating AND ratistRating
        if (existingRating) {
          await prisma.movieRating.update({
            where: { id: existingRating.id },
            data: {
              ...(row.rating != null ? { overallRating: row.rating, ratistRating: row.rating } : {}),
              ...(row.review ? { reviewText: row.review } : {}),
              importSource: source,
            },
          });
        } else {
          await prisma.movieRating.create({
            data: {
              userId: user.id,
              movieId: movie.id,
              overallRating: row.rating ?? null,
              ratistRating: row.rating ?? null,
              reviewText: row.review ?? null,
              importSource: source,
            },
          });
        }

        imported++;
      } catch (err) {
        failed++;
        errors.push(`Error importing "${row.title}": ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    // Backfill: set ratistRating = overallRating for any previously imported ratings
    const staleImports = await prisma.movieRating.findMany({
      where: { userId: user.id, importSource: { not: null }, ratistRating: null, overallRating: { not: null } },
      select: { id: true, overallRating: true },
    });
    for (const s of staleImports) {
      await prisma.movieRating.update({ where: { id: s.id }, data: { ratistRating: s.overallRating } }).catch(() => {});
    }

    // Rebuild user profile after import
    if (imported > 0) {
      rebuildUserProfile(user.id).catch((err) => console.error("Profile rebuild after import error:", err));
    }

    return NextResponse.json({ imported, skipped, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
