import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { name, poster_path, first_air_date } = body;

    // Ensure show exists in DB
    const tvShow = await prisma.tVShow.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: {
        tmdbId: Number(tmdbId),
        name: name ?? "Unknown",
        posterPath: poster_path ?? null,
        firstAirDate: first_air_date ?? null,
      },
      update: {},
    });

    // Toggle seen status
    const existing = await prisma.userFavoriteShow.findUnique({
      where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
    });

    if (existing) {
      // Check if user has a rating — prevent unseen if rated
      const hasRating = await prisma.tVShowRating.findFirst({
        where: { userId: user.id, tvShowId: tvShow.id },
        select: { id: true },
      });
      if (hasRating) {
        return NextResponse.json({ error: "Cannot un-mark a show as seen when you have a rating for it. Delete your rating first.", hasRating: true }, { status: 409 });
      }

      // Check if user has episodes marked as seen
      const episodeSeenCount = await prisma.episodeSeen.count({
        where: { userId: user.id, showTmdbId: Number(tmdbId) },
      });
      if (episodeSeenCount > 0) {
        return NextResponse.json({
          error: `You have ${episodeSeenCount} episode${episodeSeenCount !== 1 ? "s" : ""} marked as seen for this show. Remove them first or use the episode tracker on the show page.`,
          hasEpisodes: true,
          episodeSeenCount,
        }, { status: 409 });
      }

      await prisma.userFavoriteShow.delete({
        where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
      });
      return NextResponse.json({ seen: false });
    } else {
      await prisma.userFavoriteShow.create({
        data: { userId: user.id, tvShowId: tvShow.id },
      });
      return NextResponse.json({ seen: true });
    }
  } catch (err) {
    console.error("Show seen toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ seen: false, watchlisted: false, rating: null, communityAvg: null });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ seen: false, watchlisted: false, rating: null, communityAvg: null });

    const tvShow = await prisma.tVShow.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!tvShow) return NextResponse.json({ seen: false, watchlisted: false, rating: null, communityAvg: null });

    const [isSeen, isWatchlisted, episodeSeenCount, userRating] = await Promise.all([
      prisma.userFavoriteShow.findUnique({
        where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
      }),
      prisma.watchlistShow.findFirst({
        where: { tvShowId: tvShow.id, watchlist: { userId: user.id } },
      }),
      prisma.episodeSeen.count({
        where: { userId: user.id, showTmdbId: Number(tmdbId) },
      }),
      prisma.tVShowRating.findFirst({
        where: { userId: user.id, tvShowId: tvShow.id, ratingScope: "series", seasonNumber: 0 },
        select: {
          ratistRating: true, overallRating: true,
          storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
          reviewType: true,
          // Required fields for status check
          plot: true, storytelling: true, pacingClimax: true,
          cinematography: true, artisticEffect: true,
          overallEmotion: true, relatability: true,
          casting: true, actingQuality: true, appeal: true,
        },
      }),
    ]);

    // Community averages for this show
    const aggregates = await prisma.tVShowRating.aggregate({
      where: { tvShowId: tvShow.id, ratingScope: "series", ratistRating: { not: null }, excluded: false },
      _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      _sum: { ratistRating: true },
      _count: { ratistRating: true },
    });

    const ratingForClient = userRating ? {
      ratistRating: userRating.ratistRating,
      overallRating: userRating.overallRating,
      storyScore: userRating.storyScore,
      styleScore: userRating.styleScore,
      emotiveScore: userRating.emotiveScore,
      actingScore: userRating.actingScore,
      entertainScore: userRating.entertainScore,
    } : null;

    // Determine rating status
    let ratingStatus: string | null = null;
    if (userRating) {
      const hasRequired = userRating.plot != null && userRating.storytelling != null && userRating.pacingClimax != null &&
        userRating.cinematography != null && userRating.artisticEffect != null &&
        userRating.overallEmotion != null && userRating.relatability != null &&
        userRating.casting != null && userRating.actingQuality != null && userRating.appeal != null;
      ratingStatus = hasRequired ? "complete" : "incomplete";
    }

    return NextResponse.json({
      seen: !!isSeen,
      watchlisted: !!isWatchlisted,
      episodeSeenCount,
      rating: ratingForClient,
      ratingStatus,
      communityAvg: {
        ratistRating: aggregates._avg.ratistRating,
        ratistSum: aggregates._sum.ratistRating,
        storyScore: aggregates._avg.storyScore,
        styleScore: aggregates._avg.styleScore,
        emotiveScore: aggregates._avg.emotiveScore,
        actingScore: aggregates._avg.actingScore,
        entertainScore: aggregates._avg.entertainScore,
        count: aggregates._count.ratistRating,
      },
    });
  } catch (err) {
    console.error("Show user data error:", err);
    return NextResponse.json({ seen: false, watchlisted: false, rating: null, communityAvg: null });
  }
}
