import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { ensureUpcomingWeeks, runStatusTransitions, getSuperlatives } from "@/lib/movie-club";
import { activeBackstageUserWhere } from "@/lib/subscription";

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
    // Auto-generate upcoming weeks (status transitions handled by admin or cron only)
    await ensureUpcomingWeeks().catch(() => {});

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

    // Upcoming weeks — regular users see 2, API returns all scheduled (frontend limits display)
    const upcoming = await prisma.movieClubWeek.findMany({
      where: { status: "scheduled" },
      orderBy: { startDate: "asc" },
      select: { id: true, weekNumber: true, startDate: true, pickMethod: true, pickTeaser: true, revealEarly: true, movieTitle: true, moviePoster: true, movieTmdbId: true, movie: { select: { releaseDate: true } } },
    });

    // Membership — only counts when the user's Backstage Pass is
    // currently active. We keep MovieClubMember rows around past
    // expiry so re-subscribers don't have to rejoin, but the public
    // count and the user's "isMember" flag should both reflect
    // present-tense membership.
    let isMember = false;
    if (user) {
      const membership = await prisma.movieClubMember.findFirst({
        where: { userId: user.id, user: activeBackstageUserWhere() },
        select: { id: true },
      });
      isMember = !!membership;
    }
    const memberCount = await prisma.movieClubMember.count({
      where: { user: activeBackstageUserWhere() },
    });

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

      // Fetch TMDB details for active weeks
      let movieYear: string | undefined;
      let movieRuntime: string | undefined;
      let movieMpaRating: string | undefined;
      let movieStreaming: string[] | undefined;
      if (w.movieTmdbId && (w.status === "watching" || w.status === "discussion")) {
        try {
          const tmdbKey = process.env.TMDB_API_KEY;
          const [detailRes, provRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/${w.movieTmdbId}?api_key=${tmdbKey}&append_to_response=release_dates`, { next: { revalidate: 86400 } }),
            fetch(`https://api.themoviedb.org/3/movie/${w.movieTmdbId}/watch/providers?api_key=${tmdbKey}`, { next: { revalidate: 86400 } }),
          ]);
          if (detailRes.ok) {
            const d = await detailRes.json();
            movieYear = d.release_date?.slice(0, 4);
            movieRuntime = d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : undefined;
            const usRel = d.release_dates?.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
            movieMpaRating = usRel?.release_dates?.find((x: { certification: string }) => x.certification)?.certification;
          }
          if (provRes.ok) {
            const p = await provRes.json();
            movieStreaming = (p.results?.US?.flatrate ?? []).map((s: { provider_name: string }) => s.provider_name).slice(0, 4);
          }
        } catch { /* ignore */ }
      }

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
        movieYear, movieRuntime, movieMpaRating, movieStreaming,
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
      upcoming: upcoming.map((u) => ({ ...u, movieYear: (u as { movie?: { releaseDate?: string } }).movie?.releaseDate?.slice(0, 4) ?? null, movie: undefined })),
      isMember,
      memberCount,
      userVoteCount,
    });
  } catch (err) {
    console.error("Movie club weeks error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
