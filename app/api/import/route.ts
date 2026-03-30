import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { rebuildUserProfile } from "@/lib/profile";

interface ImportRow {
  title: string;
  year?: number;
  rating?: number; // already normalized to 1-10
  review?: string;
  watchedDate?: string;
}

async function searchTMDB(title: string, year?: number): Promise<{ id: number; title: string; posterPath: string | null; releaseDate: string | null } | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ query: title, api_key: apiKey, include_adult: "false" });
  if (year) params.set("year", String(year));

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.results?.[0];
    if (!first) return null;
    return {
      id: first.id,
      title: first.title,
      posterPath: first.poster_path ?? null,
      releaseDate: first.release_date ?? null,
    };
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
        // Search TMDB
        const tmdbResult = await searchTMDB(row.title, row.year);
        if (!tmdbResult) {
          failed++;
          errors.push(`Not found: "${row.title}" (${row.year ?? "unknown year"})`);
          continue;
        }

        // Upsert movie stub
        const movie = await prisma.movie.upsert({
          where: { tmdbId: tmdbResult.id },
          create: {
            tmdbId: tmdbResult.id,
            title: tmdbResult.title,
            posterPath: tmdbResult.posterPath,
            releaseDate: tmdbResult.releaseDate,
          },
          update: {
            ...(tmdbResult.posterPath ? { posterPath: tmdbResult.posterPath } : {}),
            ...(tmdbResult.releaseDate ? { releaseDate: tmdbResult.releaseDate } : {}),
          },
        });

        // Check if user already has a COMPLETE rating — skip if so
        const existingRating = await prisma.movieRating.findUnique({
          where: { userId_movieId: { userId: user.id, movieId: movie.id } },
          select: { id: true, plot: true },
        });
        if (existingRating?.plot != null) {
          // Has a complete rating — don't overwrite
          skipped++;
          continue;
        }

        // Mark as seen
        const watchedAt = row.watchedDate ? new Date(row.watchedDate) : new Date();
        await prisma.userFavoriteMovie.upsert({
          where: { userId_movieId: { userId: user.id, movieId: movie.id } },
          create: { userId: user.id, movieId: movie.id, watchedDate: watchedAt },
          update: {},
        });

        // Create/update incomplete rating with overallRating + review only
        if (existingRating) {
          // Already has an incomplete rating — update overall/review if not set
          await prisma.movieRating.update({
            where: { id: existingRating.id },
            data: {
              ...(row.rating != null ? { overallRating: row.rating } : {}),
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

    // Rebuild user profile after import so imported ratings contribute to preferences
    if (imported > 0) {
      rebuildUserProfile(user.id).catch((err) => console.error("Profile rebuild after import error:", err));
    }

    return NextResponse.json({ imported, skipped, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
