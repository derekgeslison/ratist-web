import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getBatchScoreEstimates } from "@/lib/profile";

export const dynamic = "force-dynamic";

// Simple seeded PRNG (mulberry32) for deterministic-per-request shuffling
function seededRng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, forYouOrder: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const seedParam = req.nextUrl.searchParams.get("seed");
    const rng = seededRng(seedParam ? parseInt(seedParam, 10) : Date.now());

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // --- 1. Following Activity ---
    // Pulls accepted follows minus mutual blocks. A user the viewer
    // already follows but later blocks (in either direction) gets
    // dropped here so their content doesn't keep appearing in feed.
    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== user.id) blockedIds.add(b.blockerId);
      if (b.blockedId !== user.id) blockedIds.add(b.blockedId);
    }
    const following = await prisma.userFollow.findMany({
      where: { followerId: user.id, status: "accepted" },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId).filter((id) => !blockedIds.has(id));

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
          releaseDate: r.movie.releaseDate, createdAt: r.createdAt.toISOString(),
          user: r.user, userRating: r.ratistRating != null ? Number(r.ratistRating) : r.overallRating != null ? Number(r.overallRating) : null,
        })),
        ...tvRatings.map((r) => ({
          type: "tv" as const, tmdbId: r.tvShow.tmdbId, title: r.tvShow.name,
          posterPath: r.tvShow.posterPath, voteAverage: 0,
          releaseDate: r.tvShow.firstAirDate, createdAt: r.createdAt.toISOString(),
          user: r.user, userRating: r.ratistRating != null ? Number(r.ratistRating) : r.overallRating != null ? Number(r.overallRating) : null,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15);
    }

    // --- 2. "Because you liked X" ---
    const [allHighMovies, allHighShows] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: user.id, ratistRating: { gte: 8 } },
        select: { movie: { select: { tmdbId: true, title: true, posterPath: true } }, ratistRating: true },
        orderBy: { ratistRating: "desc" },
      }),
      prisma.tVShowRating.findMany({
        where: { userId: user.id, ratistRating: { gte: 8 }, ratingScope: "series" },
        select: { tvShow: { select: { tmdbId: true, name: true, posterPath: true } }, ratistRating: true },
        orderBy: { ratistRating: "desc" },
      }),
    ]);
    // Randomly pick seeds from the pool
    const topRatedMovies = shuffle(allHighMovies, rng).slice(0, 2);
    const topRatedShows = shuffle(allHighShows, rng).slice(0, 1);

    const API_KEY = process.env.TMDB_API_KEY;
    const becauseYouLiked: { source: { tmdbId: number; title: string; posterPath: string | null }; recs: unknown[] }[] = [];

    // Get user's seen IDs to filter out
    const [seenMovieRows, seenShowRows] = await Promise.all([
      prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movie: { select: { tmdbId: true } } } }),
      prisma.userFavoriteShow.findMany({ where: { userId: user.id }, select: { tvShow: { select: { tmdbId: true } } } }),
    ]);
    const seenMovieIds = new Set(seenMovieRows.map((s) => s.movie.tmdbId));
    const seenShowIds = new Set(seenShowRows.map((s) => s.tvShow.tmdbId));

    // Movie recommendations
    for (const rated of topRatedMovies) {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${rated.movie.tmdbId}/recommendations?api_key=${API_KEY}&page=1`,
          { next: { revalidate: 86400 } }
        );
        if (!res.ok) continue;
        const data = await res.json();
        type MovieRec = { id: number; title: string; poster_path: string | null; vote_average: number; release_date?: string };
        const filtered: MovieRec[] = (data.results ?? [])
          .filter((m: MovieRec) => !seenMovieIds.has(m.id) && m.vote_average >= 6);
        const recs = shuffle(filtered, rng)
          .slice(0, 5)
          .map((m) => ({
            type: "movie" as const, tmdbId: m.id, title: m.title, posterPath: m.poster_path,
            voteAverage: m.vote_average, releaseDate: m.release_date ?? null,
          }));
        if (recs.length > 0) becauseYouLiked.push({ source: rated.movie, recs });
      } catch { /* skip */ }
    }

    // TV show recommendations
    for (const rated of topRatedShows) {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/tv/${rated.tvShow.tmdbId}/recommendations?api_key=${API_KEY}&page=1`,
          { next: { revalidate: 86400 } }
        );
        if (!res.ok) continue;
        const data = await res.json();
        type ShowRec = { id: number; name: string; poster_path: string | null; vote_average: number; first_air_date?: string };
        const filtered: ShowRec[] = (data.results ?? [])
          .filter((s: ShowRec) => !seenShowIds.has(s.id) && s.vote_average >= 6);
        const recs = shuffle(filtered, rng)
          .slice(0, 5)
          .map((s) => ({
            type: "tv" as const, tmdbId: s.id, title: s.name, posterPath: s.poster_path,
            voteAverage: s.vote_average, releaseDate: s.first_air_date ?? null,
          }));
        if (recs.length > 0) becauseYouLiked.push({ source: { tmdbId: rated.tvShow.tmdbId, title: rated.tvShow.name, posterPath: rated.tvShow.posterPath }, recs });
      } catch { /* skip */ }
    }

    // --- 3. Trending on The Ratist ---
    let trendingInCluster: unknown[] = [];
    try {
      const [recentMovies, recentShows] = await Promise.all([
        prisma.movieRating.findMany({
          where: { createdAt: { gte: since30d }, ratistRating: { gte: 7.5 }, userId: { not: user.id } },
          select: { movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } }, ratistRating: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.tVShowRating.findMany({
          where: { createdAt: { gte: since30d }, ratistRating: { gte: 7.5 }, userId: { not: user.id }, ratingScope: "series" },
          select: { tvShow: { select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true } }, ratistRating: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

      const mediaCounts = new Map<string, { type: "movie" | "tv"; count: number; title: string; posterPath: string | null; releaseDate: string | null; avgRating: number; totalRating: number; tmdbId: number }>();
      for (const r of recentMovies) {
        const key = `movie-${r.movie.tmdbId}`;
        const existing = mediaCounts.get(key);
        if (existing) { existing.count++; existing.totalRating += r.ratistRating!; existing.avgRating = existing.totalRating / existing.count; }
        else mediaCounts.set(key, { type: "movie", count: 1, title: r.movie.title, posterPath: r.movie.posterPath, releaseDate: r.movie.releaseDate, avgRating: r.ratistRating!, totalRating: r.ratistRating!, tmdbId: r.movie.tmdbId });
      }
      for (const r of recentShows) {
        const key = `tv-${r.tvShow.tmdbId}`;
        const existing = mediaCounts.get(key);
        if (existing) { existing.count++; existing.totalRating += r.ratistRating!; existing.avgRating = existing.totalRating / existing.count; }
        else mediaCounts.set(key, { type: "tv", count: 1, title: r.tvShow.name, posterPath: r.tvShow.posterPath, releaseDate: r.tvShow.firstAirDate, avgRating: r.ratistRating!, totalRating: r.ratistRating!, tmdbId: r.tvShow.tmdbId });
      }

      trendingInCluster = [...mediaCounts.values()]
        .filter((d) => d.type === "movie" ? !seenMovieIds.has(d.tmdbId) : !seenShowIds.has(d.tmdbId))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((d) => ({
          type: d.type, tmdbId: d.tmdbId, title: d.title, posterPath: d.posterPath,
          voteAverage: d.avgRating, releaseDate: d.releaseDate,
        }));
    } catch { /* skip */ }

    // --- 4. Unwatched from watchlist (random selection) ---
    const [allWatchlistMovies, allWatchlistShows] = await Promise.all([
      prisma.watchlistMovie.findMany({
        where: { watchlist: { userId: user.id }, movie: { tmdbId: { notIn: [...seenMovieIds] } } },
        select: { movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } } },
      }),
      prisma.watchlistShow.findMany({
        where: { watchlist: { userId: user.id }, tvShow: { tmdbId: { notIn: [...seenShowIds] } } },
        select: { tvShow: { select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true } } },
      }),
    ]);
    const unwatchedWatchlist = [
      ...shuffle(allWatchlistMovies, rng).slice(0, 8).map((w) => ({
        type: "movie" as const, tmdbId: w.movie.tmdbId, title: w.movie.title,
        posterPath: w.movie.posterPath, voteAverage: w.movie.voteAverage ?? 0,
        releaseDate: w.movie.releaseDate,
      })),
      ...shuffle(allWatchlistShows, rng).slice(0, 4).map((w) => ({
        type: "tv" as const, tmdbId: w.tvShow.tmdbId, title: w.tvShow.name,
        posterPath: w.tvShow.posterPath, voteAverage: 0,
        releaseDate: w.tvShow.firstAirDate,
      })),
    ];

    // --- 5. Complete the rating ---
    const incompleteRatings = await prisma.movieRating.findMany({
      where: {
        userId: user.id,
        OR: [
          // Incomplete standard/critic ratings (drafts — started but not finalized)
          { reviewType: { in: ["standard", "critic"] }, ratistRating: null },
          // Quick ratings (basic mode — has rating but no pillar scores)
          { reviewType: "basic", ratistRating: { not: null } },
        ],
      },
      select: {
        id: true, overallRating: true, ratistRating: true, reviewType: true,
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20, // Fetch more so we can prioritize drafts after sorting
    });
    // Sort: incomplete drafts first, then quick ratings, then take 5
    const sortedIncomplete = incompleteRatings.sort((a, b) => {
      const aIsIncomplete = a.reviewType !== "basic" && a.ratistRating == null;
      const bIsIncomplete = b.reviewType !== "basic" && b.ratistRating == null;
      if (aIsIncomplete && !bIsIncomplete) return -1;
      if (!aIsIncomplete && bIsIncomplete) return 1;
      return 0;
    }).slice(0, 5);
    const completeTheRating = sortedIncomplete.map((r) => ({
      type: "movie" as const, tmdbId: r.movie.tmdbId, title: r.movie.title,
      posterPath: r.movie.posterPath, voteAverage: r.movie.voteAverage ?? 0,
      releaseDate: r.movie.releaseDate,
      currentRating: r.ratistRating ?? r.overallRating, reviewType: r.reviewType,
    }));

    // --- 6. Top Picks For You (personalized estimates) ---
    let topPicks: { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; communityRatistAvg?: number | null; estimatedRating: number }[] = [];
    try {
      // Get movies user has already seen or rated (to exclude)
      const [userRatedRows, userSeenRows] = await Promise.all([
        prisma.movieRating.findMany({ where: { userId: user.id }, select: { movieId: true } }),
        prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movieId: true } }),
      ]);
      const excludeIds = new Set([...userRatedRows.map((r) => r.movieId), ...userSeenRows.map((r) => r.movieId)]);

      // Get all movies with at least 1 Ratist rating that user hasn't seen/rated
      const ratedMovieIds = await prisma.movieRating.groupBy({
        by: ["movieId"],
        where: { ratistRating: { not: null }, excluded: false, movieId: { notIn: [...excludeIds] } },
        _count: { ratistRating: true },
      });

      const candidateIds = ratedMovieIds.map((r) => r.movieId).slice(0, 150);

      if (candidateIds.length > 0) {
        const estimates = await getBatchScoreEstimates(user.id, candidateIds);
        const movieDetails = await prisma.movie.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true },
        });
        const detailMap = new Map(movieDetails.map((m) => [m.id, m]));

        // Get community Ratist averages for display
        const communityAvgs = await prisma.movieRating.groupBy({
          by: ["movieId"],
          where: { movieId: { in: candidateIds }, ratistRating: { not: null }, excluded: false },
          _avg: { ratistRating: true },
        });
        const avgMap = new Map(communityAvgs.map((c) => [c.movieId, c._avg.ratistRating]));

        topPicks = candidateIds
          .map((id) => {
            const est = estimates.get(id);
            const detail = detailMap.get(id);
            if (!est || !detail) return null;
            return {
              tmdbId: detail.tmdbId,
              title: detail.title,
              posterPath: detail.posterPath,
              releaseDate: detail.releaseDate,
              voteAverage: detail.voteAverage,
              communityRatistAvg: avgMap.get(id) ? Math.round(avgMap.get(id)! * 10) / 10 : null,
              estimatedRating: est,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b!.estimatedRating - a!.estimatedRating)
          .slice(0, 30) as typeof topPicks;
      }
    } catch (e) { console.error("Top picks error:", e); }

    // --- 7. Anticipated by people you follow ---
    // Surfaces upcoming films/shows that >=1 followed user has on a
    // non-private watchlist. Uses the same followingIds set we
    // already filtered for blocks above. Watchlist.isPrivate=false
    // is the visibility gate — accepted-follow already implies the
    // viewer can see protected content, so a public-or-followee-
    // visible-watchlist check reduces to just the per-watchlist
    // privacy flag here.
    const todayIso = new Date().toISOString().slice(0, 10);
    let anticipated: Array<{
      type: "movie" | "tv";
      tmdbId: number;
      title: string;
      posterPath: string | null;
      voteAverage: number;
      releaseDate: string | null;
      followingCount: number;
    }> = [];
    if (followingIds.length > 0) {
      const [anticipatedMovies, anticipatedShows] = await Promise.all([
        prisma.watchlistMovie.findMany({
          where: {
            watchlist: { userId: { in: followingIds }, isPrivate: false },
            movie: { releaseDate: { gt: todayIso } },
          },
          select: {
            watchlist: { select: { userId: true } },
            movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } },
          },
        }),
        prisma.watchlistShow.findMany({
          where: {
            watchlist: { userId: { in: followingIds }, isPrivate: false },
            tvShow: { firstAirDate: { gt: todayIso } },
          },
          select: {
            watchlist: { select: { userId: true } },
            tvShow: { select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true } },
          },
        }),
      ]);

      // Aggregate distinct follower count per item. We exclude items
      // the viewer already has on their own watchlist or has marked
      // seen — surfacing "your follows are anticipating X" for
      // something already in their watchlist isn't useful.
      const ownWatchlistMovieIds = new Set(allWatchlistMovies.map((w) => w.movie.tmdbId));
      const ownWatchlistShowIds = new Set(allWatchlistShows.map((w) => w.tvShow.tmdbId));

      const movieAgg = new Map<number, { item: typeof anticipatedMovies[number]["movie"]; users: Set<string> }>();
      for (const row of anticipatedMovies) {
        if (ownWatchlistMovieIds.has(row.movie.tmdbId) || seenMovieIds.has(row.movie.tmdbId)) continue;
        const k = row.movie.tmdbId;
        if (!movieAgg.has(k)) movieAgg.set(k, { item: row.movie, users: new Set() });
        movieAgg.get(k)!.users.add(row.watchlist.userId);
      }
      const showAgg = new Map<number, { item: typeof anticipatedShows[number]["tvShow"]; users: Set<string> }>();
      for (const row of anticipatedShows) {
        if (ownWatchlistShowIds.has(row.tvShow.tmdbId) || seenShowIds.has(row.tvShow.tmdbId)) continue;
        const k = row.tvShow.tmdbId;
        if (!showAgg.has(k)) showAgg.set(k, { item: row.tvShow, users: new Set() });
        showAgg.get(k)!.users.add(row.watchlist.userId);
      }

      anticipated = [
        ...[...movieAgg.values()].map((v) => ({
          type: "movie" as const,
          tmdbId: v.item.tmdbId,
          title: v.item.title,
          posterPath: v.item.posterPath,
          voteAverage: v.item.voteAverage ?? 0,
          releaseDate: v.item.releaseDate,
          followingCount: v.users.size,
        })),
        ...[...showAgg.values()].map((v) => ({
          type: "tv" as const,
          tmdbId: v.item.tmdbId,
          title: v.item.name,
          posterPath: v.item.posterPath,
          voteAverage: 0,
          releaseDate: v.item.firstAirDate,
          followingCount: v.users.size,
        })),
      ]
        // Sort: highest follower count first, then earliest release.
        // Earliest-release tiebreak surfaces what's hitting next.
        .sort((a, b) => {
          if (b.followingCount !== a.followingCount) return b.followingCount - a.followingCount;
          return (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999");
        })
        .slice(0, 20);
    }

    // Count completed Ratist reviews (not quick/imported/drafts) for disclaimer
    const ratistReviewCount = await prisma.movieRating.count({
      where: { userId: user.id, plot: { not: null }, ratistRating: { not: null } },
    });

    return NextResponse.json({
      topPicks,
      followActivity,
      becauseYouLiked,
      trendingInCluster,
      unwatchedWatchlist,
      anticipated,
      completeTheRating,
      ratistReviewCount,
      sectionOrder: (user.forYouOrder as string[] | null) ?? null,
    });
  } catch (err) {
    console.error("For You feed error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
