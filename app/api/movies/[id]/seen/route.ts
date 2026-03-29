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

    // Ensure movie exists in DB
    const { title, poster_path, release_date } = await req.json();
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
      await prisma.userFavoriteMovie.delete({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      });
      return NextResponse.json({ seen: false });
    } else {
      await prisma.userFavoriteMovie.create({
        data: { userId: user.id, movieId: movie.id, watchedDate: new Date() },
      });
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
    await prisma.userFavoriteMovie.update({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      data: { watchedDate: watchedDate ? new Date(watchedDate) : null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Seen date update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
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
      prisma.userWatchlistMovie.findUnique({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      }),
      prisma.movieRating.findUnique({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
        select: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      }),
    ]);

    // Get community averages for this movie
    const aggregates = await prisma.movieRating.aggregate({
      where: { movieId: movie.id, ratistRating: { not: null } },
      _avg: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
      _sum: { ratistRating: true },
      _count: { ratistRating: true },
    });

    return NextResponse.json({
      seen: !!isSeen,
      watchlisted: !!isWatchlisted,
      rating: userRating ?? null,
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
    console.error("Movie user data error:", err);
    return NextResponse.json({ seen: false, rating: null, predictedRating: null });
  }
}
