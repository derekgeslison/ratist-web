import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { IMAGE_BASE_URL } from "@/lib/tmdb";
import { getBatchScoreEstimates } from "@/lib/profile";

export const dynamic = "force-dynamic";

// GET /api/widget/top-picks
//
// Native widgets render up to 8 of the user's highest-estimated
// unwatched titles. Mirrors the "Top Picks For You" section on
// /for-you (app/api/feed/for-you/route.ts) but trims fields the
// widget can't use (votes, release date, community avg) to keep
// the response small.
//
// Auth: Firebase ID token.
// Shape: { items: [{ tmdbId, mediaType, title, posterUrl, estimatedRating }] }
//
// mediaType is always "movie" for now — the for-you feed scores movies
// only. When TV-side estimates are wired in, this route gains the same
// path with no schema break.

const ITEM_CAP = 8;
const CANDIDATE_CAP = 150;

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Exclude movies the user has rated or marked seen.
    const [ratedRows, seenRows] = await Promise.all([
      prisma.movieRating.findMany({ where: { userId: user.id }, select: { movieId: true } }),
      prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movieId: true } }),
    ]);
    const excludeIds = new Set([
      ...ratedRows.map((r) => r.movieId),
      ...seenRows.map((r) => r.movieId),
    ]);

    // Candidate pool: movies with at least one published Ratist rating
    // and not in the exclude set. Same filter as the for-you feed.
    const ratedMovieIds = await prisma.movieRating.groupBy({
      by: ["movieId"],
      where: {
        ratistRating: { not: null },
        excluded: false,
        movieId: { notIn: [...excludeIds] },
      },
      _count: { ratistRating: true },
    });
    const candidateIds = ratedMovieIds.map((r) => r.movieId).slice(0, CANDIDATE_CAP);

    if (candidateIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const [estimates, movieDetails] = await Promise.all([
      getBatchScoreEstimates(user.id, candidateIds),
      prisma.movie.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, tmdbId: true, title: true, posterPath: true, posterBlocked: true },
      }),
    ]);
    const detailMap = new Map(movieDetails.map((m) => [m.id, m]));

    const ranked = candidateIds
      .map((id) => {
        const est = estimates.get(id);
        const detail = detailMap.get(id);
        if (!est || !detail || detail.posterBlocked) return null;
        return {
          tmdbId: detail.tmdbId,
          mediaType: "movie" as const,
          title: detail.title,
          posterUrl: detail.posterPath ? `${IMAGE_BASE_URL}/w342${detail.posterPath}` : null,
          estimatedRating: Math.round(est * 10) / 10,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.estimatedRating - a.estimatedRating)
      .slice(0, ITEM_CAP);

    return NextResponse.json({ items: ranked });
  } catch (err) {
    console.error("[widget/top-picks] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
