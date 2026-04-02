import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const yearFrom = req.nextUrl.searchParams.get("yearFrom") ?? "";
    const yearTo = req.nextUrl.searchParams.get("yearTo") ?? "";

    // Fetch all ratings with movie data in one query
    const allRatings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      select: {
        id: true, ratistRating: true, overallRating: true, createdAt: true, movieId: true,
        movie: {
          select: {
            title: true, runtime: true, releaseDate: true, voteAverage: true,
            genres: { select: { genre: { select: { name: true } } } },
            cast: {
              where: { OR: [{ creditType: "cast" }, { creditType: "crew", job: "Director" }] },
              select: { creditType: true, job: true, castOrder: true, celebrity: { select: { name: true } } },
              take: 10,
            },
          },
        },
      },
    });

    // Fetch seen movies for watch dates + genre data
    const allSeen = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      select: {
        movieId: true, watchedDate: true, createdAt: true,
        movie: {
          select: {
            runtime: true, releaseDate: true,
            genres: { select: { genre: { select: { name: true } } } },
          },
        },
      },
    });

    // Apply year range filter on movie release date
    function inYearRange(releaseDate: string | null): boolean {
      if (!yearFrom && !yearTo) return true;
      const year = releaseDate?.slice(0, 4) ?? "";
      if (!year) return true;
      if (yearFrom && year < yearFrom) return false;
      if (yearTo && year > yearTo) return false;
      return true;
    }

    const ratings = allRatings.filter((r) => inYearRange(r.movie.releaseDate));
    const seen = allSeen.filter((s) => inYearRange(s.movie.releaseDate));

    // ── Compute all analytics ──

    const ratedMovies = ratings.filter((r) => r.ratistRating != null);
    const totalRated = ratedMovies.length;
    const totalSeen = seen.length;
    const allScores = ratedMovies.map((r) => r.ratistRating!);
    const avgRating = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
    // Watch time from all seen movies (not just rated)
    const totalRuntime = seen.reduce((sum, s) => sum + (s.movie.runtime ?? 0), 0);

    // ── Viewing velocity (movies per month) — only movies with actual watch dates ──
    const datedSeen = seen.filter((s) => s.watchedDate != null);
    const monthCounts: Record<string, number> = {};
    for (const s of datedSeen) {
      const d = s.watchedDate!;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = (monthCounts[key] ?? 0) + 1;
    }
    const velocity = Object.entries(monthCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // ── Genre breakdown (all seen movies, with avg from rated) ──
    // Build a rating lookup by movieId
    const ratingByMovieId = new Map(ratings.map((r) => [r.movieId, r.ratistRating]));
    const genreMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    for (const s of seen) {
      const score = ratingByMovieId.get(s.movieId) ?? null;
      for (const g of s.movie.genres) {
        const name = g.genre.name;
        const entry = genreMap.get(name) ?? { count: 0, totalScore: 0, ratedCount: 0 };
        entry.count++;
        if (score != null) { entry.totalScore += score; entry.ratedCount++; }
        genreMap.set(name, entry);
      }
    }
    const genres = [...genreMap.entries()]
      .map(([name, d]) => ({ name, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => b.count - a.count);

    // ── Decade breakdown (all seen movies, with avg from rated) ──
    const decadeMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    for (const s of seen) {
      const year = s.movie.releaseDate?.slice(0, 4);
      if (!year) continue;
      const decade = year.slice(0, 3) + "0s";
      const score = ratingByMovieId.get(s.movieId) ?? null;
      const entry = decadeMap.get(decade) ?? { count: 0, totalScore: 0, ratedCount: 0 };
      entry.count++;
      if (score != null) { entry.totalScore += score; entry.ratedCount++; }
      decadeMap.set(decade, entry);
    }
    const decades = [...decadeMap.entries()]
      .map(([decade, d]) => ({ decade, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => b.decade.localeCompare(a.decade));

    // ── Director rankings ──
    const dirMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    for (const r of ratings) {
      const dirs = r.movie.cast.filter((c) => c.creditType === "crew" && c.job === "Director");
      for (const d of dirs) {
        const name = d.celebrity.name;
        const entry = dirMap.get(name) ?? { count: 0, totalScore: 0, ratedCount: 0 };
        entry.count++;
        if (r.ratistRating != null) { entry.totalScore += r.ratistRating; entry.ratedCount++; }
        dirMap.set(name, entry);
      }
    }
    const directors = [...dirMap.entries()]
      .filter(([, d]) => d.count >= 2)
      .map(([name, d]) => ({ name, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .slice(0, 20);

    // ── Actor rankings ──
    const actorMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    for (const r of ratings) {
      const actors = r.movie.cast.filter((c) => c.creditType === "cast").slice(0, 5);
      for (const a of actors) {
        const name = a.celebrity.name;
        const entry = actorMap.get(name) ?? { count: 0, totalScore: 0, ratedCount: 0 };
        entry.count++;
        if (r.ratistRating != null) { entry.totalScore += r.ratistRating; entry.ratedCount++; }
        actorMap.set(name, entry);
      }
    }
    const actors = [...actorMap.entries()]
      .filter(([, d]) => d.count >= 2)
      .map(([name, d]) => ({ name, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .slice(0, 20);

    // ── Rating distribution (0-10 in 0.5 steps) ──
    const distBuckets: Record<string, number> = {};
    for (let i = 0; i <= 10; i++) distBuckets[String(i)] = 0;
    for (const s of allScores) {
      const bucket = String(Math.floor(s));
      distBuckets[bucket] = (distBuckets[bucket] ?? 0) + 1;
    }
    const distribution = Object.entries(distBuckets).map(([score, count]) => ({ score: Number(score), count }));

    // ── Rating trend over time (avg by month rated) ──
    const trendMap = new Map<string, { total: number; count: number }>();
    for (const r of ratedMovies) {
      const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const entry = trendMap.get(key) ?? { total: 0, count: 0 };
      entry.total += r.ratistRating!;
      entry.count++;
      trendMap.set(key, entry);
    }
    const ratingTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, avgRating: Math.round((d.total / d.count) * 10) / 10, count: d.count }));

    // ── Contrarian score (avg deviation from community) ──
    let totalDeviation = 0;
    let deviationCount = 0;
    const controversialPicks: { title: string; userScore: number; communityScore: number; diff: number }[] = [];
    for (const r of ratedMovies) {
      if (r.movie.voteAverage != null && r.movie.voteAverage > 0) {
        const diff = r.ratistRating! - r.movie.voteAverage;
        totalDeviation += Math.abs(diff);
        deviationCount++;
        controversialPicks.push({
          title: r.movie.title,
          userScore: r.ratistRating!,
          communityScore: r.movie.voteAverage,
          diff: Math.round(diff * 10) / 10,
        });
      }
    }
    const contrarianScore = deviationCount > 0 ? Math.round((totalDeviation / deviationCount) * 10) / 10 : null;
    const mostControversial = controversialPicks
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 10);

    // ── Seasonal patterns (movies watched per calendar month — only dated) ──
    const seasonalCounts = Array(12).fill(0) as number[];
    for (const s of datedSeen) {
      seasonalCounts[s.watchedDate!.getMonth()]++;
    }
    const seasonal = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      .map((month, i) => ({ month, count: seasonalCounts[i] }));

    // ── Blind spots (genres with < 3 movies or 0) ──
    const allGenres = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"];
    const blindSpots = allGenres
      .filter((g) => (genreMap.get(g)?.count ?? 0) < 3)
      .map((g) => ({ genre: g, count: genreMap.get(g)?.count ?? 0 }));

    return NextResponse.json({
      overview: {
        totalRated, totalSeen, totalDated: datedSeen.length,
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        totalRuntime, totalHours: Math.round(totalRuntime / 60),
        avgMovieLength: totalSeen > 0 ? Math.round(totalRuntime / totalSeen) : null,
      },
      velocity,
      genres,
      decades,
      directors,
      actors,
      distribution,
      ratingTrend,
      contrarianScore,
      mostControversial,
      seasonal,
      blindSpots,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
