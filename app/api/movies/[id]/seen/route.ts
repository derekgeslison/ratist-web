import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getRatingStatus } from "@/lib/rating-status";
import { getScoreEstimate } from "@/lib/profile";
import { checkBadges, recheckBadges } from "@/lib/badges";

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

    // Ensure movie exists in DB
    const body = await req.json().catch(() => ({}));
    const { title, poster_path, release_date, noDate } = body;
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: poster_path ?? null, releaseDate: release_date ?? null },
      update: { ...(release_date ? { releaseDate: release_date } : {}) },
    });

    // Toggle favorite/seen
    const existing = await prisma.userFavoriteMovie.findUnique({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
    });

    if (existing) {
      // Check if user has a rating — prevent unseen if rated
      const hasRating = await prisma.movieRating.findUnique({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
        select: { id: true },
      });
      if (hasRating) {
        return NextResponse.json({ error: "Cannot un-mark a movie as seen when you have a rating for it. Delete your rating first.", hasRating: true }, { status: 409 });
      }
      await prisma.userFavoriteMovie.delete({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      });
      recheckBadges(user.id, "seen").catch(() => {});
      recheckBadges(user.id, "watchlog").catch(() => {});
      return NextResponse.json({ seen: false });
    } else {
      // Respect autoDateOnSeen preference (or noDate flag from onboarding)
      const autoDate = user.autoDateOnSeen === true; // only set date if explicitly true
      const setDate = noDate === true ? false : autoDate;
      const watchedDate = setDate ? new Date() : null;
      await prisma.userFavoriteMovie.create({
        data: { userId: user.id, movieId: movie.id, watchedDate },
      });
      // Also create a watch log entry (for diary/rewatch tracking)
      if (watchedDate) {
        await prisma.userWatchLog.create({
          data: { userId: user.id, movieId: movie.id, watchedDate, isRewatch: false },
        }).catch(() => {}); // non-critical
      }
      checkBadges(user.id, "seen").catch(() => {});
      if (watchedDate) checkBadges(user.id, "watchlog").catch(() => {});
      return NextResponse.json({ seen: true });
    }
  } catch (err) {
    console.error("Seen toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!movie) return NextResponse.json({ error: "Movie not found" }, { status: 404 });

    const { watchedDate } = await req.json();
    // Handle both "YYYY-MM-DD" and "YYYY-MM-DDT12:00:00" formats
    const dateStr = watchedDate ? String(watchedDate).split("T")[0] : null;
    const parsedDate = dateStr ? new Date(`${dateStr}T12:00:00`) : null;

    // Check if parsedDate is valid
    if (parsedDate && isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date", received: watchedDate }, { status: 400 });
    }

    // Check record exists before updating
    const existing = await prisma.userFavoriteMovie.findUnique({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Movie not marked as seen" }, { status: 404 });
    }

    await prisma.userFavoriteMovie.update({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      data: { watchedDate: parsedDate },
    });

    if (parsedDate) checkBadges(user.id, "watchlog").catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Seen date update error:", err);
    return NextResponse.json({ error: "Server error", detail: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ seen: false, rating: null, predictedRating: null });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ seen: false, rating: null, predictedRating: null });

    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!movie) return NextResponse.json({ seen: false, rating: null, predictedRating: null });

    const [isSeen, isWatchlisted, userRating] = await Promise.all([
      prisma.userFavoriteMovie.findUnique({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      }),
      prisma.watchlistMovie.findFirst({
        where: { movieId: movie.id, watchlist: { userId: user.id } },
      }),
      prisma.movieRating.findUnique({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
        select: {
          ratistRating: true, overallRating: true, storyScore: true, styleScore: true,
          emotiveScore: true, actingScore: true, entertainScore: true,
          // required fields for completeness check
          plot: true, storytelling: true, pacingClimax: true,
          cinematography: true, artisticEffect: true,
          overallEmotion: true, relatability: true,
          casting: true, actingQuality: true, appeal: true,
          importSource: true,
          reviewType: true,
        },
      }),
    ]);

    // Get community averages for this movie
    const aggregates = await prisma.movieRating.aggregate({
      where: { movieId: movie.id, ratistRating: { not: null } },
      _avg: {
        ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
        // Individual fields for expandable breakdown
        plot: true, premiseOriginality: true, storytelling: true, characterDev: true, pacingClimax: true,
        cinematography: true, locationCost: true, artisticEffect: true, visualEffects: true, musicSound: true,
        overallEmotion: true, relatability: true, meaning: true, movingness: true,
        casting: true, actingQuality: true, dialogueScripting: true, blockingChoreo: true,
        appeal: true, superficialAllure: true, choreography: true,
      },
      _sum: { ratistRating: true },
      _count: { ratistRating: true },
    });

    const ratingStatus = userRating ? getRatingStatus(userRating) : null;
    // Strip required-check fields before sending to client
    const ratingForClient = userRating ? {
      ratistRating: userRating.ratistRating,
      overallRating: userRating.overallRating,
      storyScore: userRating.storyScore,
      styleScore: userRating.styleScore,
      emotiveScore: userRating.emotiveScore,
      actingScore: userRating.actingScore,
      entertainScore: userRating.entertainScore,
    } : null;

    // Compute estimate when user has no rating or their rating has no computed score yet
    const estimatedRating = (!userRating || userRating.ratistRating == null)
      ? await getScoreEstimate(user.id, movie.id)
      : null;

    return NextResponse.json({
      seen: !!isSeen,
      watchlisted: !!isWatchlisted,
      rating: ratingForClient,
      ratingStatus,
      estimatedRating,
      communityAvg: {
        ratistRating: aggregates._avg.ratistRating,
        ratistSum: aggregates._sum.ratistRating,
        storyScore: aggregates._avg.storyScore,
        styleScore: aggregates._avg.styleScore,
        emotiveScore: aggregates._avg.emotiveScore,
        actingScore: aggregates._avg.actingScore,
        entertainScore: aggregates._avg.entertainScore,
        count: aggregates._count.ratistRating,
        // Individual fields for expandable breakdown
        fields: {
          plot: aggregates._avg.plot, premiseOriginality: aggregates._avg.premiseOriginality,
          storytelling: aggregates._avg.storytelling, characterDev: aggregates._avg.characterDev,
          pacingClimax: aggregates._avg.pacingClimax,
          cinematography: aggregates._avg.cinematography, locationCost: aggregates._avg.locationCost,
          artisticEffect: aggregates._avg.artisticEffect, visualEffects: aggregates._avg.visualEffects,
          musicSound: aggregates._avg.musicSound,
          overallEmotion: aggregates._avg.overallEmotion, relatability: aggregates._avg.relatability,
          meaning: aggregates._avg.meaning, movingness: aggregates._avg.movingness,
          casting: aggregates._avg.casting, actingQuality: aggregates._avg.actingQuality,
          dialogueScripting: aggregates._avg.dialogueScripting, blockingChoreo: aggregates._avg.blockingChoreo,
          appeal: aggregates._avg.appeal, superficialAllure: aggregates._avg.superficialAllure,
          choreography: aggregates._avg.choreography,
        },
      },
    });
  } catch (err) {
    console.error("Movie user data error:", err);
    return NextResponse.json({ seen: false, rating: null, predictedRating: null });
  }
}
