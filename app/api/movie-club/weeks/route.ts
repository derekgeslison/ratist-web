import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { ensureUpcomingWeeks, runStatusTransitions, getSuperlatives } from "@/lib/movie-club";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, firebaseUid: true } });
}

/** GET — get weeks for the movie club page. Also triggers auto-generation and transitions. */
export async function GET(req: NextRequest) {
  try {
    // Auto-generate upcoming weeks and run status transitions
    await ensureUpcomingWeeks().catch(() => {});
    await runStatusTransitions().catch(() => {});

    const user = await getUser(req);

    // Get active + recent weeks (watching, discussion, archived)
    const weeks = await prisma.movieClubWeek.findMany({
      where: { status: { in: ["watching", "discussion", "archived"] } },
      orderBy: { weekNumber: "desc" },
      take: 12,
      include: {
        ratings: {
          select: {
            rating: true, reviewText: true, reviewType: true, isRewatch: true, createdAt: true,
            user: { select: { firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { ratings: true } },
      },
    });

    // Voting weeks (community_vote in voting status)
    const votingWeeks = await prisma.movieClubWeek.findMany({
      where: { status: "voting" },
      include: {
        nominations: {
          include: {
            user: { select: { firebaseUid: true, name: true } },
            _count: { select: { votes: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Upcoming weeks (show only 2 weeks ahead, starting after today)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const upcoming = await prisma.movieClubWeek.findMany({
      where: { status: { in: ["scheduled", "voting"] }, startDate: { gt: today } },
      orderBy: { startDate: "asc" },
      take: 2,
      select: { id: true, weekNumber: true, startDate: true, pickMethod: true, pickTeaser: true },
    });

    // Membership
    let isMember = false;
    if (user) {
      const membership = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
      isMember = !!membership;
    }
    const memberCount = await prisma.movieClubMember.count();

    // User's ratings
    const userRatings = user
      ? await prisma.movieClubRating.findMany({
          where: { userId: user.id, weekId: { in: weeks.map((w) => w.id) } },
          select: { weekId: true, rating: true },
        })
      : [];
    const userRatingMap = Object.fromEntries(userRatings.map((r) => [r.weekId, r.rating]));

    // User's nomination votes
    const userNomVotes = user
      ? await prisma.movieClubNominationVote.findMany({
          where: { userId: user.id },
          select: { nominationId: true },
        })
      : [];
    const userNomVoteSet = new Set(userNomVotes.map((v) => v.nominationId));

    // Enrich weeks
    const enrichedWeeks = await Promise.all(weeks.map(async (w) => {
      const avgRating = w.ratings.length > 0
        ? Math.round(w.ratings.reduce((s, r) => s + r.rating, 0) / w.ratings.length * 10) / 10
        : null;

      // Only include ratings in discussion phase, and only if user has submitted
      const userHasRated = !!userRatingMap[w.id];
      const showRatings = w.status === "discussion" || w.status === "archived";
      const canSeeDiscussion = showRatings && (userHasRated || w.status === "archived");

      const superlatives = canSeeDiscussion ? await getSuperlatives(w.id) : [];

      return {
        id: w.id,
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        endDate: w.endDate,
        status: w.status,
        pickMethod: w.pickMethod,
        pickTeaser: w.pickTeaser,
        movieTmdbId: w.movieTmdbId,
        movieTitle: w.movieTitle,
        moviePoster: w.moviePoster,
        avgRating: canSeeDiscussion ? avgRating : null,
        participantCount: w._count.ratings,
        rewatchCount: w.ratings.filter((r) => r.isRewatch).length,
        userRating: userRatingMap[w.id] ?? null,
        ratings: canSeeDiscussion ? w.ratings : [],
        superlatives,
        canSeeDiscussion,
      };
    }));

    // Enrich voting weeks
    const enrichedVoting = votingWeeks.map((w) => ({
      ...w,
      nominations: w.nominations.map((n) => ({
        id: n.id,
        tmdbId: n.tmdbId,
        title: n.title,
        posterPath: n.posterPath,
        submittedBy: n.user.name,
        voteCount: n._count.votes,
        userVoted: userNomVoteSet.has(n.id),
      })),
    }));

    // Count how many votes the user has cast this week (max 3)
    let userVoteCount = 0;
    if (user && votingWeeks.length > 0) {
      userVoteCount = await prisma.movieClubNominationVote.count({
        where: { userId: user.id, nomination: { weekId: { in: votingWeeks.map((w) => w.id) } } },
      });
    }

    return NextResponse.json({
      weeks: enrichedWeeks,
      votingWeeks: enrichedVoting,
      upcoming,
      isMember,
      memberCount,
      userVoteCount,
    });
  } catch (err) {
    console.error("Movie club weeks error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
