import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // --- 1. Following Activity ---
    const following = await prisma.userFollow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);

    let followActivity: unknown[] = [];
    if (followingIds.length > 0) {
      const [movieRatings, tvRatings] = await Promise.all([
        prisma.movieRating.findMany({
          where: { userId: { in: followingIds }, createdAt: { gte: since30d }, ratistRating: { not: null } },
          select: {
            id: true, ratistRating: true, overallRating: true, reviewText: true, createdAt: true,
            user: { select: { name: true, firebaseUid: true, avatarUrl: true } },
            movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        prisma.tVShowRating.findMany({
          where: { userId: { in: followingIds }, createdAt: { gte: since30d }, ratistRating: { not: null }, ratingScope: "series" },
          select: {
            id: true, ratistRating: true, overallRating: true, reviewText: true, createdAt: true,
            user: { select: { name: true, firebaseUid: true, avatarUrl: true } },
            tvShow: { select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      followActivity = [
        ...movieRatings.map((r) => ({
          type: "movie" as const, tmdbId: r.movie.tmdbId, title: r.movie.title,
          posterPath: r.movie.posterPath, voteAverage: r.movie.voteAverage ?? 0,
          releaseDate: r.movie.releaseDate, createdAt: r.createdAt.toISOString(), user: r.user,
        })),
        ...tvRatings.map((r) => ({
          type: "tv" as const, tmdbId: r.tvShow.tmdbId, title: r.tvShow.name,
          posterPath: r.tvShow.posterPath, voteAverage: 0,
          releaseDate: r.tvShow.firstAirDate, createdAt: r.createdAt.toISOString(), user: r.user,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15);
    }

    // --- 2. "Because you liked X" ---
    const topRated = await prisma.movieRating.findMany({
      where: { userId: user.id, ratistRating: { gte: 8 } },
      select: { movie: { select: { tmdbId: true, title: true, posterPath: true } }, ratistRating: true },
      orderBy: { ratistRating: "desc" },
      take: 3,
    });

    // For each top-rated movie, get TMDB recommendations
    const API_KEY = process.env.TMDB_API_KEY;
    const becauseYouLiked: { source: { tmdbId: number; title: string; posterPath: string | null }; recs: { tmdbId: number; title: string; posterPath: string | null; voteAverage: number }[] }[] = [];

    // Get user's seen movie IDs to filter out
    const seenMovieIds = new Set(
      (await prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        select: { movie: { select: { tmdbId: true } } },
      })).map((s) => s.movie.tmdbId)
    );

    for (const rated of topRated) {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${rated.movie.tmdbId}/recommendations?api_key=${API_KEY}&page=1`,
          { next: { revalidate: 86400 } }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const recs = (data.results ?? [])
          .filter((m: { id: number; vote_average: number }) => !seenMovieIds.has(m.id) && m.vote_average >= 6)
          .slice(0, 5)
          .map((m: { id: number; title: string; poster_path: string | null; vote_average: number; release_date?: string }) => ({
            type: "movie" as const, tmdbId: m.id, title: m.title, posterPath: m.poster_path,
            voteAverage: m.vote_average, releaseDate: m.release_date ?? null,
          }));
        if (recs.length > 0) {
          becauseYouLiked.push({ source: rated.movie, recs });
        }
      } catch { /* skip */ }
    }

    // --- 3. Trending in your taste cluster ---
    // Find users with similar taste (via persona similarity), get their recent high ratings
    let trendingInCluster: unknown[] = [];
    try {
      {
        // Get recent highly-rated movies from all users
        const recentPopular = await prisma.movieRating.findMany({
          where: { createdAt: { gte: since30d }, ratistRating: { gte: 7.5 }, userId: { not: user.id } },
          select: { movie: { select: { tmdbId: true, title: true, posterPath: true } }, ratistRating: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        // Count how many users rated each movie highly
        const movieCounts = new Map<number, { count: number; title: string; posterPath: string | null; avgRating: number; totalRating: number }>();
        for (const r of recentPopular) {
          const existing = movieCounts.get(r.movie.tmdbId);
          if (existing) {
            existing.count++;
            existing.totalRating += r.ratistRating!;
            existing.avgRating = existing.totalRating / existing.count;
          } else {
            movieCounts.set(r.movie.tmdbId, { count: 1, title: r.movie.title, posterPath: r.movie.posterPath, avgRating: r.ratistRating!, totalRating: r.ratistRating! });
          }
        }
        trendingInCluster = [...movieCounts.entries()]
          .filter(([tmdbId]) => !seenMovieIds.has(tmdbId))
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([tmdbId, d]) => ({
            type: "movie" as const, tmdbId, title: d.title, posterPath: d.posterPath,
            voteAverage: d.avgRating, releaseDate: null,
          }));
      }
    } catch { /* skip */ }

    // --- 4. Unwatched from watchlist ---
    const watchlistItems = await prisma.watchlistMovie.findMany({
      where: {
        watchlist: { userId: user.id },
        movie: { tmdbId: { notIn: [...seenMovieIds] } },
      },
      select: {
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
      },
      orderBy: { addedAt: "desc" },
      take: 10,
    });
    const unwatchedWatchlist = watchlistItems.map((w) => ({
      type: "movie" as const, tmdbId: w.movie.tmdbId, title: w.movie.title,
      posterPath: w.movie.posterPath, voteAverage: w.movie.voteAverage ?? 0,
      releaseDate: w.movie.releaseDate,
    }));

    // --- 5. Complete the rating ---
    const incompleteRatings = await prisma.movieRating.findMany({
      where: {
        userId: user.id,
        OR: [
          // Quick ratings (basic mode — has overallRating but no pillar scores)
          { reviewType: "basic", ratistRating: { not: null } },
          // Incomplete standard ratings (missing required fields)
          { reviewType: { in: ["standard", "critic"] }, ratistRating: null, overallRating: { not: null } },
        ],
      },
      select: {
        id: true, overallRating: true, ratistRating: true, reviewType: true,
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    const completeTheRating = incompleteRatings.map((r) => ({
      type: "movie" as const, tmdbId: r.movie.tmdbId, title: r.movie.title,
      posterPath: r.movie.posterPath, voteAverage: r.movie.voteAverage ?? 0,
      releaseDate: r.movie.releaseDate,
      currentRating: r.ratistRating ?? r.overallRating, reviewType: r.reviewType,
    }));

    return NextResponse.json({
      followActivity,
      becauseYouLiked,
      trendingInCluster,
      unwatchedWatchlist,
      completeTheRating,
    });
  } catch (err) {
    console.error("For You feed error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
