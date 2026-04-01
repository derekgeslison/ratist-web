import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getRatingStatus } from "@/lib/rating-status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ ratings: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ ratings: [] });

    const allRatings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
            genres: { include: { genre: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also get watched dates and find unrated seen movies
    const favorites = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
            genres: { include: { genre: { select: { name: true } } } },
          },
        },
      },
    });
    const watchedDateMap = new Map(favorites.map((f) => [f.movieId, f.watchedDate]));
    const ratedMovieIds = new Set(allRatings.map((r) => r.movieId));

    const ratings = allRatings.map((r) => ({
      id: r.id,
      tmdbId: r.movie.tmdbId,
      title: r.movie.title,
      posterPath: r.movie.posterPath,
      year: r.movie.releaseDate?.slice(0, 4) ?? "",
      genres: r.movie.genres.map((g) => g.genre.name),
      voteAverage: r.movie.voteAverage ?? null,
      ratistRating: r.ratistRating,
      overallRating: r.overallRating,
      reviewText: r.reviewText,
      reviewType: r.reviewType,
      ratingStatus: getRatingStatus(r as unknown as Record<string, unknown>),
      watchedDate: watchedDateMap.get(r.movieId)?.toISOString() ?? null,
      ratedAt: r.createdAt.toISOString(),
    }));

    // Seen movies with no rating record at all
    const unrated = favorites
      .filter((f) => !ratedMovieIds.has(f.movieId))
      .map((f) => ({
        tmdbId: f.movie.tmdbId,
        title: f.movie.title,
        posterPath: f.movie.posterPath,
        year: f.movie.releaseDate?.slice(0, 4) ?? "",
        genres: f.movie.genres.map((g) => g.genre.name),
        voteAverage: f.movie.voteAverage ?? null,
        watchedDate: f.watchedDate?.toISOString() ?? null,
        seenAt: f.createdAt.toISOString(),
      }));

    return NextResponse.json({ ratings, unrated });
  } catch (err) {
    console.error("Ratings list error:", err);
    return NextResponse.json({ ratings: [] });
  }
}
