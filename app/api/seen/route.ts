import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [] });

    const [favorites, watchLog, favoriteShows] = await Promise.all([
      prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        include: {
          movie: {
            select: {
              id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userWatchLog.findMany({
        where: { userId: user.id, isRewatch: true },
        include: {
          movie: {
            select: {
              id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { watchedDate: "desc" },
      }),
      prisma.userFavoriteShow.findMany({
        where: { userId: user.id },
        include: {
          tvShow: {
            select: {
              id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id, ratingScope: "series" }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // First watches from UserFavoriteMovie
    const movies = favorites.map((f) => ({
      id: f.movie.id,
      logId: null as string | null,
      tmdbId: f.movie.tmdbId,
      title: f.movie.title,
      posterPath: f.movie.posterPath,
      year: f.movie.releaseDate?.slice(0, 4) ?? "",
      voteAverage: f.movie.voteAverage ?? null,
      genres: f.movie.genres.map((g) => g.genre.name),
      ratistRating: f.movie.ratings[0]?.ratistRating ?? null,
      seenAt: f.createdAt,
      watchedDate: f.watchedDate,
      isRewatch: false,
      notes: null as string | null,
      mediaType: "movie" as const,
    }));

    // Rewatches from UserWatchLog
    const rewatches = watchLog.map((w) => ({
      id: w.movie.id,
      logId: w.id,
      tmdbId: w.movie.tmdbId,
      title: w.movie.title,
      posterPath: w.movie.posterPath,
      year: w.movie.releaseDate?.slice(0, 4) ?? "",
      voteAverage: w.movie.voteAverage ?? null,
      genres: w.movie.genres.map((g) => g.genre.name),
      ratistRating: w.movie.ratings[0]?.ratistRating ?? null,
      seenAt: w.createdAt,
      watchedDate: w.watchedDate,
      isRewatch: true,
      notes: w.notes,
      mediaType: "movie" as const,
    }));

    // TV Shows from UserFavoriteShow
    const shows = favoriteShows.map((s) => ({
      id: s.tvShow.id,
      logId: null as string | null,
      tmdbId: s.tvShow.tmdbId,
      title: s.tvShow.name,
      posterPath: s.tvShow.posterPath,
      year: s.tvShow.firstAirDate?.slice(0, 4) ?? "",
      voteAverage: s.tvShow.voteAverage ?? null,
      genres: s.tvShow.genres.map((g) => g.genre.name),
      ratistRating: s.tvShow.ratings[0]?.ratistRating ?? null,
      seenAt: s.createdAt,
      watchedDate: null as Date | null,
      isRewatch: false,
      notes: null as string | null,
      mediaType: "tv" as const,
    }));

    return NextResponse.json({ movies: [...movies, ...rewatches, ...shows] });
  } catch (err) {
    console.error("Seen list error:", err);
    return NextResponse.json({ movies: [] });
  }
}
