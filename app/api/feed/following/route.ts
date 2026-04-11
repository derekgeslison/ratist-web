import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ items: [] });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
    if (!user) return NextResponse.json({ items: [] });

    // Get followed user IDs
    const following = await prisma.userFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    if (followingIds.length === 0) return NextResponse.json({ items: [] });

    // Fetch recent movie ratings from followed users (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [movieRatings, tvRatings] = await Promise.all([
      prisma.movieRating.findMany({
        where: {
          userId: { in: followingIds },
          createdAt: { gte: since },
          ratistRating: { not: null },
        },
        select: {
          id: true,
          ratistRating: true,
          overallRating: true,
          createdAt: true,
          user: { select: { name: true, firebaseUid: true, avatarUrl: true } },
          movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.tVShowRating.findMany({
        where: {
          userId: { in: followingIds },
          createdAt: { gte: since },
          ratistRating: { not: null },
          ratingScope: "series",
        },
        select: {
          id: true,
          ratistRating: true,
          overallRating: true,
          createdAt: true,
          user: { select: { name: true, firebaseUid: true, avatarUrl: true } },
          tvShow: { select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Merge and sort by date
    const items = [
      ...movieRatings.map((r) => ({
        id: r.id,
        type: "movie" as const,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        voteAverage: r.movie.voteAverage ?? 0,
        releaseDate: r.movie.releaseDate,
        rating: r.ratistRating != null ? Number(r.ratistRating) : r.overallRating != null ? Number(r.overallRating) : null,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
      })),
      ...tvRatings.map((r) => ({
        id: r.id,
        type: "tv" as const,
        tmdbId: r.tvShow.tmdbId,
        title: r.tvShow.name,
        posterPath: r.tvShow.posterPath,
        voteAverage: 0,
        releaseDate: r.tvShow.firstAirDate,
        rating: r.ratistRating != null ? Number(r.ratistRating) : r.overallRating != null ? Number(r.overallRating) : null,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Following feed error:", err);
    return NextResponse.json({ items: [] });
  }
}
