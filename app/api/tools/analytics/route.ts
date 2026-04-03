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
        // Category scores
        storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
        // Individual field scores
        plot: true, premiseOriginality: true, storytelling: true, characterDev: true, pacingClimax: true,
        cinematography: true, locationCost: true, realism: true, artisticEffect: true, visualEffects: true, musicSound: true,
        overallEmotion: true, relatability: true, meaning: true, movingness: true,
        casting: true, actingQuality: true, dialogueScripting: true, blockingChoreo: true,
        appeal: true, superficialAllure: true, choreography: true,
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

    // ── Director & Actor rankings (from all seen movies) ──
    // Batch fetch cast for all seen movieIds
    const seenMovieIds = seen.map((s) => s.movieId);
    const allCast = seenMovieIds.length > 0 ? await prisma.movieCast.findMany({
      where: {
        movieId: { in: seenMovieIds },
        OR: [{ creditType: "cast" }, { creditType: "crew", job: "Director" }],
      },
      select: { movieId: true, creditType: true, job: true, castOrder: true, celebrity: { select: { name: true } } },
    }) : [];

    // Group cast by movie for easy lookup
    const castByMovie = new Map<string, typeof allCast>();
    for (const c of allCast) {
      const list = castByMovie.get(c.movieId) ?? [];
      list.push(c);
      castByMovie.set(c.movieId, list);
    }

    const dirMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    const actorMap = new Map<string, { count: number; totalScore: number; ratedCount: number }>();
    for (const s of seen) {
      const cast = castByMovie.get(s.movieId) ?? [];
      const score = ratingByMovieId.get(s.movieId) ?? null;
      // Directors
      for (const c of cast.filter((c) => c.creditType === "crew" && c.job === "Director")) {
        const entry = dirMap.get(c.celebrity.name) ?? { count: 0, totalScore: 0, ratedCount: 0 };
        entry.count++;
        if (score != null) { entry.totalScore += score; entry.ratedCount++; }
        dirMap.set(c.celebrity.name, entry);
      }
      // Actors (top 5 billed)
      const actors = cast.filter((c) => c.creditType === "cast").sort((a, b) => a.castOrder - b.castOrder).slice(0, 5);
      for (const c of actors) {
        const entry = actorMap.get(c.celebrity.name) ?? { count: 0, totalScore: 0, ratedCount: 0 };
        entry.count++;
        if (score != null) { entry.totalScore += score; entry.ratedCount++; }
        actorMap.set(c.celebrity.name, entry);
      }
    }

    // Top rated (2+ films with ratings)
    const directorsTopRated = [...dirMap.entries()]
      .filter(([, d]) => d.ratedCount >= 2)
      .map(([name, d]) => ({ name, count: d.count, avgRating: Math.round((d.totalScore / d.ratedCount) * 10) / 10 }))
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 10);

    const actorsTopRated = [...actorMap.entries()]
      .filter(([, d]) => d.ratedCount >= 2)
      .map(([name, d]) => ({ name, count: d.count, avgRating: Math.round((d.totalScore / d.ratedCount) * 10) / 10 }))
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 10);

    // Most watched (by total count)
    const directorsMostWatched = [...dirMap.entries()]
      .map(([name, d]) => ({ name, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const actorsMostWatched = [...actorMap.entries()]
      .map(([name, d]) => ({ name, count: d.count, avgRating: d.ratedCount > 0 ? Math.round((d.totalScore / d.ratedCount) * 10) / 10 : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

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
    const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const seasonalCounts = Array(12).fill(0) as number[];
    for (const s of datedSeen) {
      seasonalCounts[s.watchedDate!.getMonth()]++;
    }
    // Rotate to show last 12 months from current month when no year filter
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const seasonal = (!yearFrom && !yearTo)
      ? Array.from({ length: 12 }, (_, i) => {
          const idx = (currentMonthIdx + 1 + i) % 12; // start from next month last year
          return { month: MONTH_LABELS[idx], count: seasonalCounts[idx] };
        })
      : MONTH_LABELS.map((month, i) => ({ month, count: seasonalCounts[i] }));

    // ── Day of week patterns (only dated entries) ──
    const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayCounts = Array(7).fill(0) as number[];
    for (const s of datedSeen) {
      dayCounts[s.watchedDate!.getDay()]++;
    }
    const dayOfWeek = DAY_LABELS.map((day, i) => ({ day, count: dayCounts[i] }));

    // ── Category & field averages ──
    function fieldAvg(key: string): number | null {
      const vals = ratings.map((r) => (r as Record<string, unknown>)[key]).filter((v): v is number => v != null && typeof v === "number");
      return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    const categoryAverages = {
      story: { score: fieldAvg("storyScore"), fields: { plot: fieldAvg("plot"), premiseOriginality: fieldAvg("premiseOriginality"), storytelling: fieldAvg("storytelling"), characterDev: fieldAvg("characterDev"), pacingClimax: fieldAvg("pacingClimax") } },
      style: { score: fieldAvg("styleScore"), fields: { cinematography: fieldAvg("cinematography"), locationCost: fieldAvg("locationCost"), realism: fieldAvg("realism"), artisticEffect: fieldAvg("artisticEffect"), visualEffects: fieldAvg("visualEffects"), musicSound: fieldAvg("musicSound") } },
      emotive: { score: fieldAvg("emotiveScore"), fields: { overallEmotion: fieldAvg("overallEmotion"), relatability: fieldAvg("relatability"), meaning: fieldAvg("meaning"), movingness: fieldAvg("movingness") } },
      acting: { score: fieldAvg("actingScore"), fields: { casting: fieldAvg("casting"), actingQuality: fieldAvg("actingQuality"), dialogueScripting: fieldAvg("dialogueScripting"), blockingChoreo: fieldAvg("blockingChoreo") } },
      entertainment: { score: fieldAvg("entertainScore"), fields: { appeal: fieldAvg("appeal"), superficialAllure: fieldAvg("superficialAllure"), choreography: fieldAvg("choreography") } },
    };

    // ── Blind spots (genres with < 3 movies or 0) ──
    const allGenres = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"];
    const blindSpots = allGenres
      .filter((g) => (genreMap.get(g)?.count ?? 0) < 3)
      .map((g) => ({ genre: g, count: genreMap.get(g)?.count ?? 0 }));

    // ── Average movie age ──
    const currentYear = new Date().getFullYear();
    let totalAge = 0;
    let ageCount = 0;
    for (const s of seen) {
      const yr = parseInt(s.movie.releaseDate?.slice(0, 4) ?? "");
      if (!isNaN(yr)) { totalAge += currentYear - yr; ageCount++; }
    }
    const avgMovieAge = ageCount > 0 ? Math.round(totalAge / ageCount) : null;

    // ── Profile type (based on decade distribution) ──
    const recentCount = (decadeMap.get("2020s")?.count ?? 0) + (decadeMap.get("2010s")?.count ?? 0);
    const classicCount = [...decadeMap.entries()].filter(([d]) => d < "2000s").reduce((s, [, d]) => s + d.count, 0);
    const profileTotal = totalSeen || 1;
    let profileType = "Film Explorer";
    if (recentCount / profileTotal > 0.8) profileType = "Modern Movie Fan";
    else if (classicCount / profileTotal > 0.3) profileType = "Classic Film Buff";
    else if (decadeMap.size >= 6) profileType = "Era-Spanning Cinephile";

    // ── Genre diversity score (Shannon entropy normalized 0-100) ──
    const genreTotal = genres.reduce((s, g) => s + g.count, 0);
    let genreDiversity = 0;
    if (genreTotal > 0 && genres.length > 1) {
      let entropy = 0;
      for (const g of genres) {
        const p = g.count / genreTotal;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      const maxEntropy = Math.log2(genres.length);
      genreDiversity = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
    }

    // ── Guilty pleasure genre (most watched but below-average rating) ──
    const overallAvgForGP = avgRating ?? 0;
    const guiltyPleasure = genres
      .filter((g) => g.count >= 20 && g.avgRating != null && g.avgRating < overallAvgForGP)
      .sort((a, b) => b.count - a.count)[0]?.name ?? null;

    // ── Unique director/actor counts ──
    const uniqueDirectors = dirMap.size;
    const uniqueActors = actorMap.size;

    // ── Rater personality ──
    let raterType = "Balanced Rater";
    if (allScores.length >= 3) {
      const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      const variance = allScores.reduce((s, v) => s + (v - mean) ** 2, 0) / allScores.length;
      const stdDev = Math.sqrt(variance);
      if (mean >= 7.5) raterType = "Generous Rater";
      else if (mean <= 5) raterType = "Tough Critic";
      else if (stdDev >= 2) raterType = "Polarized Taste";
    }

    // ── Harshest / most generous category ──
    const catScores = [
      { label: "Story", score: fieldAvg("storyScore") },
      { label: "Style", score: fieldAvg("styleScore") },
      { label: "Emotion", score: fieldAvg("emotiveScore") },
      { label: "Acting", score: fieldAvg("actingScore") },
      { label: "Entertainment", score: fieldAvg("entertainScore") },
    ].filter((c) => c.score != null) as { label: string; score: number }[];
    const harshestCategory = catScores.length > 0 ? catScores.reduce((a, b) => a.score < b.score ? a : b) : null;
    const generousCategory = catScores.length > 0 ? catScores.reduce((a, b) => a.score > b.score ? a : b) : null;

    // ── Avg movies per month (from dated span) ──
    let avgPerMonth: number | null = null;
    if (datedSeen.length >= 2) {
      const sorted = [...datedSeen].sort((a, b) => a.watchedDate!.getTime() - b.watchedDate!.getTime());
      const first = sorted[0].watchedDate!;
      const last = sorted[sorted.length - 1].watchedDate!;
      const monthSpan = Math.max((last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()), 1);
      avgPerMonth = Math.round((datedSeen.length / monthSpan) * 10) / 10;
    }

    return NextResponse.json({
      overview: {
        totalRated, totalSeen, totalDated: datedSeen.length,
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        totalRuntime, totalHours: Math.round(totalRuntime / 60),
        avgMovieLength: totalSeen > 0 ? Math.round(totalRuntime / totalSeen) : null,
        avgMovieAge,
        profileType,
      },
      velocity,
      genres,
      decades,
      directorsTopRated,
      actorsTopRated,
      directorsMostWatched,
      actorsMostWatched,
      uniqueDirectors,
      uniqueActors,
      distribution,
      ratingTrend,
      contrarianScore,
      mostControversial,
      raterType,
      harshestCategory,
      generousCategory,
      genreDiversity,
      guiltyPleasure,
      seasonal,
      dayOfWeek,
      avgPerMonth,
      blindSpots,
      categoryAverages,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
