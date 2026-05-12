import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, isAdmin: true } });
  return user?.isAdmin ? user : null;
}

// GET: list fraud flags + summary stats
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";

  const flags = await prisma.fraudFlag.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Resolve user names for display
  const allUserIds = new Set<string>();
  for (const f of flags) {
    for (const uid of f.userIds as string[]) allUserIds.add(uid);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...allUserIds] } },
    select: { id: true, name: true, email: true, createdAt: true, bannedAt: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Resolve target movie/show names. show / show_season / show_episode
  // all use a TVShow DB id, so we can pool them into one lookup.
  const movieIds = flags.filter((f) => f.targetType === "movie" && f.targetId).map((f) => f.targetId!);
  const showIds = flags
    .filter((f) => (f.targetType === "show" || f.targetType === "show_season" || f.targetType === "show_episode") && f.targetId)
    .map((f) => f.targetId!);
  const [movies, shows] = await Promise.all([
    movieIds.length > 0 ? prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true, title: true, tmdbId: true } }) : [],
    showIds.length > 0 ? prisma.tVShow.findMany({ where: { id: { in: showIds } }, select: { id: true, name: true, tmdbId: true } }) : [],
  ]);
  const targetMap = Object.fromEntries([
    ...movies.map((m) => [m.id, { title: m.title, tmdbId: m.tmdbId }]),
    ...shows.map((s) => [s.id, { title: s.name, tmdbId: s.tmdbId }]),
  ]);

  const counts = await prisma.fraudFlag.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  return NextResponse.json({ flags, userMap, targetMap, counts: countMap });
}

// POST: run scans or take actions
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, flagId, ...params } = await req.json();

  // ─── SCAN: Duplicate Clusters ──────────────────────────────────────
  if (action === "scan_duplicates") {
    const minShared = params.minShared ?? 10;
    const minMatchRate = params.minMatchRate ?? 0.9;

    // Get all users who have rated at least minShared movies
    const activeCounts = await prisma.movieRating.groupBy({
      by: ["userId"],
      _count: { id: true },
      having: { id: { _count: { gte: minShared } } },
    });
    const activeUserIds = activeCounts.map((c) => c.userId);

    if (activeUserIds.length < 2) {
      return NextResponse.json({ found: 0, message: "Not enough active users to compare" });
    }

    // Load all ratings for active users
    const allRatings = await prisma.movieRating.findMany({
      where: { userId: { in: activeUserIds }, ratistRating: { not: null } },
      select: { userId: true, movieId: true, ratistRating: true },
    });

    // Build per-user rating maps
    const userRatings = new Map<string, Map<string, number>>();
    for (const r of allRatings) {
      if (!userRatings.has(r.userId)) userRatings.set(r.userId, new Map());
      userRatings.get(r.userId)!.set(r.movieId, r.ratistRating!);
    }

    // Compare all pairs
    const flagsCreated: string[] = [];
    const userIdList = [...userRatings.keys()];

    for (let i = 0; i < userIdList.length; i++) {
      for (let j = i + 1; j < userIdList.length; j++) {
        const a = userIdList[i], b = userIdList[j];
        const ratingsA = userRatings.get(a)!;
        const ratingsB = userRatings.get(b)!;

        // Find shared movies
        const shared: { movieId: string; ratingA: number; ratingB: number }[] = [];
        for (const [movieId, ratingA] of ratingsA) {
          const ratingB = ratingsB.get(movieId);
          if (ratingB !== undefined) {
            shared.push({ movieId, ratingA, ratingB });
          }
        }

        if (shared.length < minShared) continue;

        const matches = shared.filter((s) => s.ratingA === s.ratingB).length;
        const matchRate = matches / shared.length;

        if (matchRate < minMatchRate) continue;

        // Check if this pair is already flagged
        const existing = await prisma.fraudFlag.findFirst({
          where: {
            type: "duplicate_cluster",
            status: { not: "dismissed" },
            userIds: { equals: [a, b].sort() },
          },
        });
        if (existing) continue;

        const flag = await prisma.fraudFlag.create({
          data: {
            type: "duplicate_cluster",
            severity: matchRate === 1.0 ? "high" : "medium",
            userIds: [a, b].sort(),
            evidence: {
              sharedCount: shared.length,
              matchRate: Math.round(matchRate * 100),
              totalA: ratingsA.size,
              totalB: ratingsB.size,
              sampleMatches: shared.filter((s) => s.ratingA === s.ratingB).slice(0, 10).map((s) => s.movieId),
            },
          },
        });
        flagsCreated.push(flag.id);
      }
    }

    return NextResponse.json({ found: flagsCreated.length, flagIds: flagsCreated });
  }

  // ─── SCAN: Review Bombing ─────────────────────────────────────────
  if (action === "scan_bombing") {
    const windowDays = params.windowDays ?? 7;
    const minRecent = params.minRecent ?? 5;
    const extremeThreshold = params.extremeThreshold ?? 0.6; // 60% extreme

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Find movies with recent rating spikes
    const recentByMovie = await prisma.movieRating.groupBy({
      by: ["movieId"],
      where: { createdAt: { gte: since }, ratistRating: { not: null } },
      _count: { id: true },
    });

    const flagsCreated: string[] = [];

    for (const group of recentByMovie) {
      if (group._count.id < minRecent) continue;

      // Get the actual recent ratings
      const recentRatings = await prisma.movieRating.findMany({
        where: { movieId: group.movieId, createdAt: { gte: since }, ratistRating: { not: null } },
        select: { userId: true, ratistRating: true, createdAt: true },
      });

      const total = recentRatings.length;
      const extremeLow = recentRatings.filter((r) => r.ratistRating! <= 2).length;
      const extremeHigh = recentRatings.filter((r) => r.ratistRating! >= 9).length;

      const isLowBomb = extremeLow / total >= extremeThreshold;
      const isHighBomb = extremeHigh / total >= extremeThreshold;

      if (!isLowBomb && !isHighBomb) continue;

      // Check for existing flag on this movie
      const existing = await prisma.fraudFlag.findFirst({
        where: { type: "review_bomb", targetId: group.movieId, status: { not: "dismissed" } },
      });
      if (existing) continue;

      const userIds = recentRatings.map((r) => r.userId);
      const flag = await prisma.fraudFlag.create({
        data: {
          type: "review_bomb",
          severity: total >= 10 ? "high" : "medium",
          userIds,
          targetType: "movie",
          targetId: group.movieId,
          evidence: {
            recentCount: total,
            extremeLowCount: extremeLow,
            extremeHighCount: extremeHigh,
            extremeRate: Math.round(Math.max(extremeLow, extremeHigh) / total * 100),
            direction: isLowBomb ? "low" : "high",
            windowDays,
            ratings: recentRatings.map((r) => ({
              userId: r.userId,
              rating: r.ratistRating,
              date: r.createdAt.toISOString().split("T")[0],
            })),
          },
        },
      });
      flagsCreated.push(flag.id);
    }

    // ── TV series-level bombs ─────────────────────────────────────
    const recentByShow = await prisma.tVShowRating.groupBy({
      by: ["tvShowId"],
      where: { createdAt: { gte: since }, ratistRating: { not: null }, ratingScope: "series" },
      _count: { id: true },
    });

    for (const group of recentByShow) {
      if (group._count.id < minRecent) continue;

      const recentRatings = await prisma.tVShowRating.findMany({
        where: { tvShowId: group.tvShowId, createdAt: { gte: since }, ratistRating: { not: null }, ratingScope: "series" },
        select: { userId: true, ratistRating: true, createdAt: true },
      });

      const total = recentRatings.length;
      const extremeLow = recentRatings.filter((r) => r.ratistRating! <= 2).length;
      const extremeHigh = recentRatings.filter((r) => r.ratistRating! >= 9).length;

      const isLowBomb = extremeLow / total >= extremeThreshold;
      const isHighBomb = extremeHigh / total >= extremeThreshold;
      if (!isLowBomb && !isHighBomb) continue;

      const existing = await prisma.fraudFlag.findFirst({
        where: { type: "review_bomb", targetType: "show", targetId: group.tvShowId, status: { not: "dismissed" } },
      });
      if (existing) continue;

      const userIds = recentRatings.map((r) => r.userId);
      const flag = await prisma.fraudFlag.create({
        data: {
          type: "review_bomb",
          severity: total >= 10 ? "high" : "medium",
          userIds,
          targetType: "show",
          targetId: group.tvShowId,
          evidence: {
            recentCount: total,
            extremeLowCount: extremeLow,
            extremeHighCount: extremeHigh,
            extremeRate: Math.round(Math.max(extremeLow, extremeHigh) / total * 100),
            direction: isLowBomb ? "low" : "high",
            windowDays,
            ratings: recentRatings.map((r) => ({
              userId: r.userId,
              rating: r.ratistRating,
              date: r.createdAt.toISOString().split("T")[0],
            })),
          },
        },
      });
      flagsCreated.push(flag.id);
    }

    // ── TV per-season bombs ───────────────────────────────────────
    // Same shape as the series scan but grouped by (tvShowId,
    // seasonNumber) and scoped to season ratings only. Surfaces in
    // the admin UI as a "review_bomb" with targetType="show_season";
    // the season number rides in evidence.
    const recentBySeason = await prisma.tVShowRating.groupBy({
      by: ["tvShowId", "seasonNumber"],
      where: { createdAt: { gte: since }, ratistRating: { not: null }, ratingScope: "season" },
      _count: { id: true },
    });

    for (const group of recentBySeason) {
      if (group._count.id < minRecent) continue;

      const recentRatings = await prisma.tVShowRating.findMany({
        where: {
          tvShowId: group.tvShowId,
          seasonNumber: group.seasonNumber,
          createdAt: { gte: since },
          ratistRating: { not: null },
          ratingScope: "season",
        },
        select: { userId: true, ratistRating: true, createdAt: true },
      });

      const total = recentRatings.length;
      const extremeLow = recentRatings.filter((r) => r.ratistRating! <= 2).length;
      const extremeHigh = recentRatings.filter((r) => r.ratistRating! >= 9).length;

      const isLowBomb = extremeLow / total >= extremeThreshold;
      const isHighBomb = extremeHigh / total >= extremeThreshold;
      if (!isLowBomb && !isHighBomb) continue;

      // Dedupe on (target, season) using JSON contains since season
      // number lives inside evidence.
      const existing = await prisma.fraudFlag.findFirst({
        where: {
          type: "review_bomb",
          targetType: "show_season",
          targetId: group.tvShowId,
          status: { not: "dismissed" },
          evidence: { path: ["seasonNumber"], equals: group.seasonNumber },
        },
      });
      if (existing) continue;

      const userIds = recentRatings.map((r) => r.userId);
      const flag = await prisma.fraudFlag.create({
        data: {
          type: "review_bomb",
          severity: total >= 10 ? "high" : "medium",
          userIds,
          targetType: "show_season",
          targetId: group.tvShowId,
          evidence: {
            seasonNumber: group.seasonNumber,
            recentCount: total,
            extremeLowCount: extremeLow,
            extremeHighCount: extremeHigh,
            extremeRate: Math.round(Math.max(extremeLow, extremeHigh) / total * 100),
            direction: isLowBomb ? "low" : "high",
            windowDays,
            ratings: recentRatings.map((r) => ({
              userId: r.userId,
              rating: r.ratistRating,
              date: r.createdAt.toISOString().split("T")[0],
            })),
          },
        },
      });
      flagsCreated.push(flag.id);
    }

    // ── Episode-level bombs ──────────────────────────────────────
    // Episode ratings are stored keyed by TMDB show id, not the
    // local TVShow DB id, so we groupBy on the TMDB triple and then
    // resolve the show row for targetId / display. minRecent is
    // halved for episodes because per-episode rating volume is
    // structurally lower than series-level. extremeLow / extremeHigh
    // thresholds stay at ≤2 / ≥9 since the rating is the same 1–10
    // scale.
    const episodeMinRecent = Math.max(3, Math.floor(minRecent / 2));
    const recentByEpisode = await prisma.episodeRating.groupBy({
      by: ["showTmdbId", "seasonNumber", "episodeNumber"],
      where: { createdAt: { gte: since }, excluded: false },
      _count: { id: true },
    });

    // Resolve all involved show rows in one pass so we can attach
    // targetId without an N+1 lookup.
    const tmdbIds = [...new Set(recentByEpisode.filter((g) => g._count.id >= episodeMinRecent).map((g) => g.showTmdbId))];
    const showRows = tmdbIds.length > 0
      ? await prisma.tVShow.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { id: true, tmdbId: true } })
      : [];
    const showRowByTmdb = new Map(showRows.map((r) => [r.tmdbId, r.id]));

    for (const group of recentByEpisode) {
      if (group._count.id < episodeMinRecent) continue;

      const recentRatings = await prisma.episodeRating.findMany({
        where: {
          showTmdbId: group.showTmdbId,
          seasonNumber: group.seasonNumber,
          episodeNumber: group.episodeNumber,
          createdAt: { gte: since },
          excluded: false,
        },
        select: { userId: true, rating: true, createdAt: true },
      });

      const total = recentRatings.length;
      const extremeLow = recentRatings.filter((r) => r.rating <= 2).length;
      const extremeHigh = recentRatings.filter((r) => r.rating >= 9).length;

      const isLowBomb = extremeLow / total >= extremeThreshold;
      const isHighBomb = extremeHigh / total >= extremeThreshold;
      if (!isLowBomb && !isHighBomb) continue;

      const showRowId = showRowByTmdb.get(group.showTmdbId);
      if (!showRowId) continue;

      const existing = await prisma.fraudFlag.findFirst({
        where: {
          type: "review_bomb",
          targetType: "show_episode",
          targetId: showRowId,
          status: { not: "dismissed" },
          AND: [
            { evidence: { path: ["seasonNumber"], equals: group.seasonNumber } },
            { evidence: { path: ["episodeNumber"], equals: group.episodeNumber } },
          ],
        },
      });
      if (existing) continue;

      const userIds = recentRatings.map((r) => r.userId);
      const flag = await prisma.fraudFlag.create({
        data: {
          type: "review_bomb",
          severity: total >= 8 ? "high" : "medium",
          userIds,
          targetType: "show_episode",
          targetId: showRowId,
          evidence: {
            showTmdbId: group.showTmdbId,
            seasonNumber: group.seasonNumber,
            episodeNumber: group.episodeNumber,
            recentCount: total,
            extremeLowCount: extremeLow,
            extremeHighCount: extremeHigh,
            extremeRate: Math.round(Math.max(extremeLow, extremeHigh) / total * 100),
            direction: isLowBomb ? "low" : "high",
            windowDays,
            ratings: recentRatings.map((r) => ({
              userId: r.userId,
              rating: r.rating,
              date: r.createdAt.toISOString().split("T")[0],
            })),
          },
        },
      });
      flagsCreated.push(flag.id);
    }

    return NextResponse.json({ found: flagsCreated.length, flagIds: flagsCreated });
  }

  // ─── SCAN: Thin Accounts ──────────────────────────────────────────
  if (action === "scan_thin") {
    const maxRatings = params.maxRatings ?? 3;

    // Find users with very few ratings, all extreme
    const userCounts = await prisma.movieRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null } },
      _count: { id: true },
      _avg: { ratistRating: true },
    });

    const flagsCreated: string[] = [];

    for (const uc of userCounts) {
      if (uc._count.id > maxRatings || uc._count.id === 0) continue;

      // Get their actual ratings
      const ratings = await prisma.movieRating.findMany({
        where: { userId: uc.userId, ratistRating: { not: null } },
        select: { ratistRating: true, movieId: true },
      });

      const allExtreme = ratings.every((r) => r.ratistRating! <= 2 || r.ratistRating! >= 9);
      if (!allExtreme) continue;

      // Check if already flagged
      const existing = await prisma.fraudFlag.findFirst({
        where: { type: "thin_account", userIds: { equals: [uc.userId] }, status: { not: "dismissed" } },
      });
      if (existing) continue;

      // Check account age
      const user = await prisma.user.findUnique({ where: { id: uc.userId }, select: { createdAt: true } });
      const accountAgeDays = user ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : null;

      const flag = await prisma.fraudFlag.create({
        data: {
          type: "thin_account",
          severity: accountAgeDays !== null && accountAgeDays < 7 ? "high" : "low",
          userIds: [uc.userId],
          evidence: {
            ratingCount: uc._count.id,
            ratings: ratings.map((r) => ({ movieId: r.movieId, rating: r.ratistRating })),
            allExtreme: true,
            accountAgeDays,
          },
        },
      });
      flagsCreated.push(flag.id);
    }

    return NextResponse.json({ found: flagsCreated.length, flagIds: flagsCreated });
  }

  // ─── ACTION: Exclude ratings ──────────────────────────────────────
  if (action === "exclude") {
    if (!flagId) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    const userIds = flag.userIds as string[];
    const reason = `Fraud flag: ${flag.type} (${flag.id})`;

    // Exclude all ratings from flagged users (or just for the target movie if review bomb)
    if (flag.type === "review_bomb" && flag.targetId) {
      if (flag.targetType === "movie") {
        await prisma.movieRating.updateMany({
          where: { userId: { in: userIds }, movieId: flag.targetId },
          data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
        });
      } else if (flag.targetType === "show_season") {
        const seasonNumber = (flag.evidence as { seasonNumber?: number })?.seasonNumber;
        await prisma.tVShowRating.updateMany({
          where: {
            userId: { in: userIds },
            tvShowId: flag.targetId,
            ratingScope: "season",
            ...(typeof seasonNumber === "number" ? { seasonNumber } : {}),
          },
          data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
        });
      } else if (flag.targetType === "show_episode") {
        const ev = flag.evidence as { showTmdbId?: number; seasonNumber?: number; episodeNumber?: number };
        if (typeof ev.showTmdbId === "number" && typeof ev.seasonNumber === "number" && typeof ev.episodeNumber === "number") {
          await prisma.episodeRating.updateMany({
            where: {
              userId: { in: userIds },
              showTmdbId: ev.showTmdbId,
              seasonNumber: ev.seasonNumber,
              episodeNumber: ev.episodeNumber,
            },
            data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
          });
        }
      } else {
        // targetType === "show" (series scope)
        await prisma.tVShowRating.updateMany({
          where: { userId: { in: userIds }, tvShowId: flag.targetId, ratingScope: "series" },
          data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
        });
      }
    } else {
      // Exclude all ratings from these users — covers all three
      // tables (duplicate_cluster / thin_account paths).
      await prisma.movieRating.updateMany({
        where: { userId: { in: userIds } },
        data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
      });
      await prisma.tVShowRating.updateMany({
        where: { userId: { in: userIds } },
        data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
      });
      await prisma.episodeRating.updateMany({
        where: { userId: { in: userIds } },
        data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
      });
    }

    await prisma.fraudFlag.update({
      where: { id: flagId },
      data: { status: "excluded", resolvedAt: new Date(), resolvedBy: admin.id },
    });

    return NextResponse.json({ ok: true });
  }

  // ─── ACTION: Dismiss flag ─────────────────────────────────────────
  if (action === "dismiss") {
    if (!flagId) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    await prisma.fraudFlag.update({
      where: { id: flagId },
      data: { status: "dismissed", resolvedAt: new Date(), resolvedBy: admin.id },
    });

    return NextResponse.json({ ok: true });
  }

  // ─── ACTION: Undo exclusion ───────────────────────────────────────
  if (action === "undo_exclude") {
    if (!flagId) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    const reason = `Fraud flag: ${flag.type} (${flag.id})`;
    const userIds = flag.userIds as string[];

    // Re-include ratings that were excluded by this specific flag.
    // Three tables to walk because review_bomb flags can target
    // movies, show series/seasons, or individual episodes.
    await prisma.movieRating.updateMany({
      where: { userId: { in: userIds }, excludedReason: reason },
      data: { excluded: false, excludedAt: null, excludedReason: null },
    });
    await prisma.tVShowRating.updateMany({
      where: { userId: { in: userIds }, excludedReason: reason },
      data: { excluded: false, excludedAt: null, excludedReason: null },
    });
    await prisma.episodeRating.updateMany({
      where: { userId: { in: userIds }, excludedReason: reason },
      data: { excluded: false, excludedAt: null, excludedReason: null },
    });

    await prisma.fraudFlag.update({
      where: { id: flagId },
      data: { status: "open", resolvedAt: null, resolvedBy: null },
    });

    return NextResponse.json({ ok: true });
  }

  // ─── ACTION: Ban cluster ──────────────────────────────────────────
  if (action === "ban_cluster") {
    if (!flagId) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    const userIds = flag.userIds as string[];
    const reason = `Fraud flag: ${flag.type} (${flag.id})`;

    // Ban all users in the cluster
    await prisma.user.updateMany({
      where: { id: { in: userIds }, isAdmin: false },
      data: { bannedAt: new Date(), banReason: `Banned via fraud detection: ${flag.type}` },
    });

    // Also exclude their ratings — all three rating tables, since a
    // banned cluster shouldn't continue contributing to any community
    // aggregate.
    await prisma.movieRating.updateMany({
      where: { userId: { in: userIds } },
      data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
    });
    await prisma.tVShowRating.updateMany({
      where: { userId: { in: userIds } },
      data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
    });
    await prisma.episodeRating.updateMany({
      where: { userId: { in: userIds } },
      data: { excluded: true, excludedAt: new Date(), excludedReason: reason },
    });

    await prisma.fraudFlag.update({
      where: { id: flagId },
      data: { status: "excluded", resolvedAt: new Date(), resolvedBy: admin.id },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
