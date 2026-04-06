import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

/** GET — get current + recent weeks for the movie club page */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);

    const weeks = await prisma.movieClubWeek.findMany({
      where: { status: { not: "upcoming" } },
      orderBy: { weekNumber: "desc" },
      take: 10,
      include: {
        ratings: {
          select: { rating: true, comment: true, createdAt: true, user: { select: { firebaseUid: true, name: true, avatarUrl: true } } },
        },
        _count: { select: { ratings: true, votes: true } },
      },
    });

    // Also get upcoming weeks (for "next week" teaser)
    const upcoming = await prisma.movieClubWeek.findMany({
      where: { status: "upcoming" },
      orderBy: { weekNumber: "asc" },
      take: 3,
      select: { id: true, weekNumber: true, startDate: true, pickMethod: true, pickTeaser: true },
    });

    // Check membership
    let isMember = false;
    let memberCount = 0;
    if (user) {
      const membership = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
      isMember = !!membership;
    }
    memberCount = await prisma.movieClubMember.count();

    // Check user's ratings for current weeks
    const userRatings = user
      ? await prisma.movieClubRating.findMany({
          where: { userId: user.id, weekId: { in: weeks.map((w) => w.id) } },
          select: { weekId: true, rating: true },
        })
      : [];
    const userRatingMap = Object.fromEntries(userRatings.map((r) => [r.weekId, r.rating]));

    // User's votes for community_vote weeks
    const userVotes = user
      ? await prisma.movieClubVote.findMany({
          where: { userId: user.id, weekId: { in: weeks.map((w) => w.id) } },
          select: { weekId: true, tmdbId: true },
        })
      : [];
    const userVoteMap = Object.fromEntries(userVotes.map((v) => [v.weekId, v.tmdbId]));

    const enrichedWeeks = weeks.map((w) => {
      const avgRating = w.ratings.length > 0
        ? Math.round(w.ratings.reduce((s, r) => s + r.rating, 0) / w.ratings.length * 10) / 10
        : null;
      return {
        ...w,
        avgRating,
        participantCount: w._count.ratings,
        userRating: userRatingMap[w.id] ?? null,
        userVote: userVoteMap[w.id] ?? null,
      };
    });

    return NextResponse.json({ weeks: enrichedWeeks, upcoming, isMember, memberCount });
  } catch (err) {
    console.error("Movie club weeks error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
