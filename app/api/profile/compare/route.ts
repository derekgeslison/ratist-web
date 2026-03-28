import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

// GET /api/profile/compare?targetUserId=...
// Returns movies both users have rated, with each user's scores side-by-side.
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("targetUserId");
    if (!targetUserId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const viewer = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!viewer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!target) return NextResponse.json({ error: "Target user not found" }, { status: 404 });

    // Fetch both users' ratings
    const [myRatings, theirRatings] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: viewer.id, ratistRating: { not: null } },
        select: {
          movieId: true,
          ratistRating: true,
          movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } },
        },
      }),
      prisma.movieRating.findMany({
        where: { userId: target.id, ratistRating: { not: null } },
        select: { movieId: true, ratistRating: true },
      }),
    ]);

    const theirMap = new Map(theirRatings.map((r) => [r.movieId, r.ratistRating!]));

    // Only movies both have rated
    const shared = myRatings
      .filter((r) => theirMap.has(r.movieId))
      .map((r) => ({
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? null,
        myRating: r.ratistRating!,
        theirRating: theirMap.get(r.movieId)!,
        diff: Math.abs(r.ratistRating! - theirMap.get(r.movieId)!),
      }))
      .sort((a, b) => a.diff - b.diff); // Most agreed-upon first by default

    // Summary stats
    const avgDiff = shared.length > 0
      ? shared.reduce((s, m) => s + m.diff, 0) / shared.length
      : null;
    const agreements = shared.filter((m) => m.diff <= 1).length;
    const disagreements = shared.filter((m) => m.diff >= 3).length;

    return NextResponse.json({
      viewer: { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl },
      target: { id: target.id, name: target.name, avatarUrl: target.avatarUrl },
      shared,
      stats: {
        totalShared: shared.length,
        avgDiff: avgDiff ? Math.round(avgDiff * 10) / 10 : null,
        agreements,
        disagreements,
      },
    });
  } catch (err) {
    console.error("Compare error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
