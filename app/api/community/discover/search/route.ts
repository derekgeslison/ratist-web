import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";
import { isSubscriptionActive } from "@/lib/subscription";
import { CRITIC_RATING_THRESHOLD } from "@/lib/watch-companion-trust";

/**
 * User discovery — free-text search by display name. Works for both
 * signed-in and signed-out viewers; the signed-in path additionally
 * computes a taste-match percentage and boosts mutual follows in the
 * sort order.
 *
 * Ranking, in order of priority:
 *   1. Exact name match (case-insensitive)
 *   2. Starts-with match
 *   3. Contains match
 *   Within each tier, mutual follows rank above non-follows; then by
 *   total rating count (more activity = more confidence).
 *
 * Same exclusion list as the twins endpoint: yourself, blocked users
 * (both directions), private profiles, opted-out (discoverable=false).
 */

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;
const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;

const PAGE_SIZE = 30;
// Search returns at most this many rows total before pagination so an
// empty / very-short query doesn't try to score the entire user base
// in memory. Specific queries narrow down further via the prisma
// `contains` filter.
const MAX_CANDIDATES = 200;
const LOW_RATING_THRESHOLD = 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const cursor = Math.max(0, parseInt(searchParams.get("cursor") ?? "0", 10));

    if (q.length === 0) {
      return NextResponse.json({ users: [], hasMore: false });
    }

    // Auth is optional — anonymous viewers can still search.
    let viewerId: string | null = null;
    let myProfile: Awaited<ReturnType<typeof prisma.userProfile.findUnique>> = null;
    const blockedIds = new Set<string>();
    const mutualFollowIds = new Set<string>();
    const authorization = req.headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
      try {
        const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
        const viewer = await prisma.user.findUnique({
          where: { firebaseUid: decoded.uid },
          select: { id: true },
        });
        if (viewer) {
          viewerId = viewer.id;
          const [profile, blocks, follows] = await Promise.all([
            prisma.userProfile.findUnique({ where: { userId: viewer.id } }),
            prisma.userBlock.findMany({
              where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] },
              select: { blockerId: true, blockedId: true },
            }),
            // Mutual follow = I follow them AND they follow me, both
            // accepted. Two passes + an intersection is cheaper than a
            // self-join at the user counts we expect.
            (async () => {
              const [mine, theirs] = await Promise.all([
                prisma.userFollow.findMany({
                  where: { followerId: viewer.id, status: "accepted" },
                  select: { followingId: true },
                }),
                prisma.userFollow.findMany({
                  where: { followingId: viewer.id, status: "accepted" },
                  select: { followerId: true },
                }),
              ]);
              const mineSet = new Set(mine.map((m) => m.followingId));
              return theirs.map((t) => t.followerId).filter((id) => mineSet.has(id));
            })(),
          ]);
          myProfile = profile;
          for (const b of blocks) {
            if (b.blockerId !== viewer.id) blockedIds.add(b.blockerId);
            if (b.blockedId !== viewer.id) blockedIds.add(b.blockedId);
          }
          for (const id of follows) mutualFollowIds.add(id);
        }
      } catch { /* fall through as anonymous */ }
    }

    const candidates = await prisma.user.findMany({
      where: {
        isPrivate: false,
        discoverable: true,
        deletedAt: null,
        bannedAt: null,
        ...(viewerId ? { id: { not: viewerId, notIn: Array.from(blockedIds) } } : {}),
        name: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        avatarUrl: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        profile: myProfile ? {
          select: {
            narrativeFocused: true, characterFocused: true, messageFocused: true,
            cinematicFocused: true, performanceFocused: true, entertainmentFocused: true,
            genreAction: true, genreHorror: true, genreDrama: true, genreHistorical: true,
            genreScifi: true, genreThriller: true, genreComedy: true, genreBookAdapt: true,
            genreFantasy: true, genreRomance: true, genreDocumentary: true, genreFamily: true,
            genreFilmNoir: true, genreMusical: true, genreBiopic: true, genreCrime: true,
            genreWestern: true, genreMystery: true, genreAnimation: true,
          },
        } : false,
        _count: { select: { followers: true, ratings: true, tvShowRatings: true } },
      },
      take: MAX_CANDIDATES,
    });

    // Pre-fetch which candidates the viewer follows (one query, not
    // one per row) so we can stamp isFollowing into the response.
    const candidateIds = candidates.map((c) => c.id);
    const followingIds = new Set<string>();
    if (viewerId && candidateIds.length > 0) {
      const followsRaw = await prisma.userFollow.findMany({
        where: { followerId: viewerId, followingId: { in: candidateIds }, status: "accepted" },
        select: { followingId: true },
      });
      for (const f of followsRaw) followingIds.add(f.followingId);
    }

    // Critic = active subscription AND >= CRITIC_RATING_THRESHOLD
    // full Ratist ratings (plot non-null). Batched as two groupBys
    // so we don't fan out N rating-count queries.
    const subActiveIds = candidates.filter(isSubscriptionActive).map((c) => c.id);
    const [movieGrouped, tvGrouped] = subActiveIds.length > 0
      ? await Promise.all([
          prisma.movieRating.groupBy({
            by: ["userId"],
            where: { userId: { in: subActiveIds }, plot: { not: null } },
            _count: { _all: true },
          }),
          prisma.tVShowRating.groupBy({
            by: ["userId"],
            where: { userId: { in: subActiveIds }, plot: { not: null }, ratingScope: "series" },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const fullRatingCounts = new Map<string, number>();
    for (const row of movieGrouped) fullRatingCounts.set(row.userId, (fullRatingCounts.get(row.userId) ?? 0) + row._count._all);
    for (const row of tvGrouped) fullRatingCounts.set(row.userId, (fullRatingCounts.get(row.userId) ?? 0) + row._count._all);
    const criticIds = new Set<string>();
    for (const [userId, count] of fullRatingCounts) {
      if (count >= CRITIC_RATING_THRESHOLD) criticIds.add(userId);
    }

    const allKeys = [...COMPONENT_KEYS, ...GENRE_KEYS] as const;
    const qLower = q.toLowerCase();

    const enriched = candidates.map((c) => {
      let match: number | null = null;
      // Profile select is gated on myProfile, so typescript narrows
      // it correctly here only when both sides exist.
      if (myProfile && "profile" in c && c.profile) {
        const theirProfile = c.profile as unknown as Record<typeof allKeys[number], number>;
        const sims = allKeys.map((key) =>
          dimensionSimilarity(myProfile![key], theirProfile[key])
        );
        match = Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 100);
      }
      const nameLower = c.name.toLowerCase();
      const matchTier = nameLower === qLower ? 3 : nameLower.startsWith(qLower) ? 2 : 1;
      return {
        id: c.id,
        firebaseUid: c.firebaseUid,
        name: c.name,
        avatarUrl: c.avatarUrl,
        match,
        followerCount: c._count.followers,
        isCritic: criticIds.has(c.id),
        ratingCount: c._count.ratings + c._count.tvShowRatings,
        isFollowing: followingIds.has(c.id),
        matchTier,
        isMutual: mutualFollowIds.has(c.id),
      };
    });

    enriched.sort((a, b) => {
      if (a.matchTier !== b.matchTier) return b.matchTier - a.matchTier;
      if (a.isMutual !== b.isMutual) return a.isMutual ? -1 : 1;
      return b.ratingCount - a.ratingCount;
    });

    const page = enriched.slice(cursor, cursor + PAGE_SIZE).map((u) => {
      // matchTier and isMutual are sort-only signals — strip from
      // the response so we don't ship ranking internals to the client.
      const { matchTier: _matchTier, isMutual: _isMutual, ...row } = u;
      void _matchTier; void _isMutual;
      return row;
    });
    const hasMore = enriched.length > cursor + PAGE_SIZE;

    return NextResponse.json({ users: page, hasMore, threshold: LOW_RATING_THRESHOLD });
  } catch (err) {
    console.error("Discovery search error:", err);
    return NextResponse.json({ users: [], hasMore: false }, { status: 500 });
  }
}
