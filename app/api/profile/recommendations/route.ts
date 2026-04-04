import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { findSimilarUsers } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [] });

    const similarUsers = await findSimilarUsers(user.id, 10);
    if (similarUsers.length === 0) return NextResponse.json({ movies: [] });

    const similarIds = similarUsers.map((s) => s.user.id);

    // Movies rated ≥8.5 by similar users that this user hasn't rated
    const ratedByUser = new Set(
      (await prisma.movieRating.findMany({
        where: { userId: user.id },
        select: { movieId: true },
      })).map((r) => r.movieId)
    );

    const seenByUser = new Set(
      (await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movieId: true },
      })).map((r) => r.movieId)
    );

    const excludeIds = new Set([...ratedByUser, ...seenByUser]);

    const topRatings = await prisma.movieRating.findMany({
      where: {
        userId: { in: similarIds },
        ratistRating: { gte: 8.0 },
      },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } } },
      orderBy: { ratistRating: "desc" },
      take: 300,
    });

    // Aggregate by movie, weight by similarity score
    const movieMap = new Map<string, { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; sum: number; count: number }>();
    const similarityMap = new Map(similarUsers.map((s) => [s.user.id, s.overallMatch / 100]));

    for (const r of topRatings) {
      if (excludeIds.has(r.movieId)) continue;
      const weight = similarityMap.get(r.userId) ?? 0.6;
      const weightedScore = (r.ratistRating ?? 0) * weight;
      const existing = movieMap.get(r.movieId);
      if (existing) {
        existing.sum += weightedScore;
        existing.count++;
      } else {
        movieMap.set(r.movieId, {
          tmdbId: r.movie.tmdbId,
          title: r.movie.title,
          posterPath: r.movie.posterPath,
          releaseDate: r.movie.releaseDate,
          voteAverage: r.movie.voteAverage,
          sum: weightedScore,
          count: 1,
        });
      }
    }

    const movies = [...movieMap.values()]
      .map((m) => ({ ...m, avgRating: m.sum / m.count }))
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 15)
      .map(({ tmdbId, title, posterPath, releaseDate, voteAverage, avgRating }) => ({ tmdbId, title, posterPath, releaseDate, voteAverage, avgRating }));

    return NextResponse.json({ movies });
  } catch (err) {
    console.error("Recommendations error:", err);
    return NextResponse.json({ movies: [] });
  }
}
