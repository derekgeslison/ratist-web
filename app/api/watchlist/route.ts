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

    // Returns want-to-watch list (UserWatchlistMovie)
    const watchlist = await prisma.userWatchlistMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            id: true,
            tmdbId: true,
            title: true,
            posterPath: true,
            releaseDate: true,
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

    const movies = watchlist.map((w) => ({
      id: w.movie.id,
      tmdbId: w.movie.tmdbId,
      title: w.movie.title,
      posterPath: w.movie.posterPath,
      year: w.movie.releaseDate?.slice(0, 4) ?? "",
      ratistRating: w.movie.ratings[0]?.ratistRating ?? null,
      addedAt: w.createdAt,
    }));

    return NextResponse.json({ movies });
  } catch (err) {
    console.error("Watchlist error:", err);
    return NextResponse.json({ movies: [] });
  }
}
