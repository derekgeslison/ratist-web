import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile/export
 *
 * Exports all personal data for the authenticated user as a JSON download.
 * Covers GDPR Article 20 (right to data portability).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: {
        id: true, name: true, email: true, bio: true, avatarUrl: true,
        createdAt: true, isPrivate: true,
        notificationPrefs: true, emailOptOut: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Fetch all user data in parallel
    const [ratings, tvRatings, watchLogs, comments, favoriteMovies, favoriteShows, watchlists, badges] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: user.id },
        select: {
          movieTmdbId: true, ratistRating: true, overallRating: true, reviewType: true,
          plot: true, storytelling: true, pacingClimax: true, cinematography: true,
          artisticEffect: true, overallEmotion: true, relatability: true,
          casting: true, actingQuality: true, appeal: true,
          reviewText: true, createdAt: true, updatedAt: true,
          movie: { select: { title: true } },
        },
      }),
      prisma.tVShowRating.findMany({
        where: { userId: user.id },
        select: {
          showTmdbId: true, ratingScope: true, seasonNumber: true,
          ratistRating: true, overallRating: true, reviewType: true,
          reviewText: true, createdAt: true, updatedAt: true,
          tvShow: { select: { name: true } },
        },
      }),
      prisma.userWatchLog.findMany({
        where: { userId: user.id },
        select: { movieTmdbId: true, watchedAt: true, note: true, movie: { select: { title: true } } },
        orderBy: { watchedAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { userId: user.id },
        select: { targetType: true, targetId: true, text: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movieTmdbId: true, movie: { select: { title: true } } },
      }),
      prisma.userFavoriteShow.findMany({
        where: { userId: user.id },
        select: { tvShowId: true, tvShow: { select: { name: true } } },
      }),
      prisma.watchlist.findMany({
        where: { userId: user.id },
        select: {
          name: true, description: true, isPublic: true, createdAt: true,
          movies: { select: { movieTmdbId: true, movie: { select: { title: true } } } },
          shows: { select: { tvShowId: true, tvShow: { select: { name: true } } } },
        },
      }),
      prisma.userBadge.findMany({
        where: { userId: user.id },
        select: { badgeKey: true, awardedAt: true },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: {
        name: user.name,
        email: user.email,
        bio: user.bio,
        createdAt: user.createdAt,
        isPrivate: user.isPrivate,
        emailOptOut: user.emailOptOut,
      },
      movieRatings: ratings.map((r) => ({
        tmdbId: r.movieTmdbId,
        title: r.movie?.title ?? null,
        ratistRating: r.ratistRating,
        overallRating: r.overallRating,
        reviewType: r.reviewType,
        review: r.reviewText,
        criteria: {
          plot: r.plot, storytelling: r.storytelling, pacingClimax: r.pacingClimax,
          cinematography: r.cinematography, artisticEffect: r.artisticEffect,
          overallEmotion: r.overallEmotion, relatability: r.relatability,
          casting: r.casting, actingQuality: r.actingQuality, appeal: r.appeal,
        },
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      })),
      tvShowRatings: tvRatings.map((r) => ({
        tmdbId: r.showTmdbId,
        name: r.tvShow?.name ?? null,
        scope: r.ratingScope, season: r.seasonNumber,
        ratistRating: r.ratistRating, overallRating: r.overallRating,
        reviewType: r.reviewType, review: r.reviewText,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      })),
      diary: watchLogs.map((l) => ({
        tmdbId: l.movieTmdbId, title: l.movie?.title ?? null,
        watchedAt: l.watchedAt, note: l.note,
      })),
      seenMovies: favoriteMovies.map((f) => ({
        tmdbId: f.movieTmdbId, title: f.movie?.title ?? null,
      })),
      seenShows: favoriteShows.map((f) => ({
        name: f.tvShow?.name ?? null,
      })),
      watchlists: watchlists.map((w) => ({
        name: w.name, description: w.description, isPublic: w.isPublic,
        createdAt: w.createdAt,
        movies: w.movies.map((m) => ({ tmdbId: m.movieTmdbId, title: m.movie?.title ?? null })),
        shows: w.shows.map((s) => ({ name: s.tvShow?.name ?? null })),
      })),
      comments: comments.map((c) => ({
        targetType: c.targetType, targetId: c.targetId,
        text: c.text, createdAt: c.createdAt,
      })),
      badges: badges.map((b) => ({ badge: b.badgeKey, awardedAt: b.awardedAt })),
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ratist-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error("Data export error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
