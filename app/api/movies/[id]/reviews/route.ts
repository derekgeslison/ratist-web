import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const filter = req.nextUrl.searchParams.get("filter");

    if (filter !== "following") {
      return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
    }

    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ reviews: [] });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ reviews: [] });

    // Get IDs of users this person follows
    const following = await prisma.userFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    if (followingIds.length === 0) return NextResponse.json({ reviews: [] });

    const dbMovie = await prisma.movie.findUnique({
      where: { tmdbId: Number(tmdbId) },
      select: { id: true },
    });
    if (!dbMovie) return NextResponse.json({ reviews: [] });

    const rawReviews = await prisma.movieRating.findMany({
      where: {
        movieId: dbMovie.id,
        userId: { in: followingIds },
        OR: [
          { reviewText: { not: null } },
          { ratistRating: { not: null } },
        ],
      },
      select: {
        id: true,
        reviewText: true,
        ratistRating: true,
        overallRating: true,
        storyScore: true,
        styleScore: true,
        emotiveScore: true,
        actingScore: true,
        entertainScore: true,
        reviewType: true,
        fieldComments: true,
        categoryComments: true,
        hasSpoilers: true,
        commentsDisabled: true,
        createdAt: true,
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const reviewIds = rawReviews.map((r) => r.id);
    const [commentCounts, likeCounts] = await Promise.all([
      prisma.comment.groupBy({
        by: ["targetId"],
        where: { targetType: "review", targetId: { in: reviewIds } },
        _count: { id: true },
      }),
      prisma.postLike.groupBy({
        by: ["targetId"],
        where: { targetType: "review", targetId: { in: reviewIds } },
        _count: { targetId: true },
      }),
    ]);
    const commentMap = new Map(commentCounts.map((c) => [c.targetId, c._count.id]));
    const likeMap = new Map(likeCounts.map((l) => [l.targetId, l._count.targetId]));

    const reviews = rawReviews.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      commentCount: commentMap.get(r.id) ?? 0,
      likeCount: likeMap.get(r.id) ?? 0,
    }));

    return NextResponse.json({ reviews });
  } catch (err) {
    console.error("Following reviews error:", err);
    return NextResponse.json({ reviews: [] });
  }
}
