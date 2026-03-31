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

    const favorites = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            id: true,
            tmdbId: true,
            title: true,
            posterPath: true,
            releaseDate: true,
            voteAverage: true,
            genres: { include: { genre: { select: { name: true } } } },
            ratings: {
              where: { userId: user.id },
              select: { ratistRating: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const movies = favorites.map((f) => ({
      id: f.movie.id,
      tmdbId: f.movie.tmdbId,
      title: f.movie.title,
      posterPath: f.movie.posterPath,
      year: f.movie.releaseDate?.slice(0, 4) ?? "",
      voteAverage: f.movie.voteAverage ?? null,
      genres: f.movie.genres.map((g) => g.genre.name),
      ratistRating: f.movie.ratings[0]?.ratistRating ?? null,
      seenAt: f.createdAt,
      watchedDate: f.watchedDate ?? f.createdAt,
    }));

    return NextResponse.json({ movies });
  } catch (err) {
    console.error("Seen list error:", err);
    return NextResponse.json({ movies: [] });
  }
}
