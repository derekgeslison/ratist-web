import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [] });

    const filter = req.nextUrl.searchParams.get("filter") ?? "all";

    // Fetch all rated movies
    const ratings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
    });

    // Fetch seen movies that don't have a rating
    const ratedMovieIds = new Set(ratings.map((r) => r.movieId));
    const seenOnly = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id, movieId: { notIn: Array.from(ratedMovieIds) } },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
    });

    // Merge: rated movies sorted by ratistRating desc, then seen-only sorted alphabetically
    const ratedSorted = ratings
      .slice()
      .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0));

    const allMovies = [
      ...ratedSorted.map((r) => ({
        id: r.id,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: r.ratistRating,
        seen: true,
      })),
      ...seenOnly.map((s) => ({
        id: `seen-${s.movieId}`,
        tmdbId: s.movie.tmdbId,
        title: s.movie.title,
        posterPath: s.movie.posterPath,
        year: s.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: null,
        seen: true,
      })),
    ];

    let filtered = allMovies;
    if (filter !== "all") {
      filtered = allMovies.filter((m) => m.year === filter);
    }

    const movies = filtered.map((m, idx) => ({ ...m, rank: idx + 1 }));

    return NextResponse.json({ movies });
  } catch (err) {
    console.error("Rankings error:", err);
    return NextResponse.json({ movies: [] });
  }
}
