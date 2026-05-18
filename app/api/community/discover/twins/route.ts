import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { dimensionSimilarity } from "@/lib/ratings";
import { isSubscriptionActive } from "@/lib/subscription";
import { CRITIC_RATING_THRESHOLD } from "@/lib/watch-companion-trust";

/**
 * Taste Twins discovery — returns public, discoverable users ranked by
 * match % against the viewer's taste profile. Exclusions match the
 * other discovery endpoints: yourself, blocked users (both directions),
 * private profiles, and users who opted out via Settings → discoverable.
 *
 * Computed in-memory against all candidate users. At the current scale
 * this is fast (a few thousand UserProfile rows, 25 numeric similarities
 * each); if/when this slows down, the path forward is a nightly job that
 * pre-computes top-N per viewer and stores them in a cache table.
 *
 * Cursor pagination is just an offset into the sorted result list. We
 * cache the full sorted list per viewer for a short window so paging
 * doesn't recompute everything on every Load More.
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
// Minimum number of finished Ratist ratings before a user's profile is
// considered to have enough signal to drive matches. Matches the same
// floor /tools/recommend uses for its "limited taste data" warning.
const LOW_RATING_THRESHOLD = 10;

interface DiscoveryUser {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  match: number | null;
  followerCount: number;
  isCritic: boolean;
  // Count of FULL Ratist ratings (rows where `plot` is filled in).
  // Quick / basic ratings don't count. This is the signal used to
  // decide whether a user has enough data for their taste profile to
  // be reliable for sorting + ranking. Total ratings would let a
  // user with 100 quick scores game discovery.
  fullRatistCount: number;
  isFollowing: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ users: [], hasMore: false, needsProfile: false });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const viewer = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!viewer) return NextResponse.json({ users: [], hasMore: false, needsProfile: false });

    const myProfile = await prisma.userProfile.findUnique({ where: { userId: viewer.id } });
    if (!myProfile) {
      // No taste profile yet — UI shows a "Rate at least N films" empty state.
      return NextResponse.json({ users: [], hasMore: false, needsProfile: true });
    }

    const { searchParams } = new URL(req.url);
    const cursor = Math.max(0, parseInt(searchParams.get("cursor") ?? "0", 10));

    // Blocked users in either direction get excluded — same rule as
    // every other discovery / community surface.
    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== viewer.id) blockedIds.add(b.blockerId);
      if (b.blockedId !== viewer.id) blockedIds.add(b.blockedId);
    }

    // Candidate pool: public, discoverable, not deleted, not banned,
    // not yourself, not blocked, and has a profile to match against.
    const candidates = await prisma.user.findMany({
      where: {
        isPrivate: false,
        discoverable: true,
        deletedAt: null,
        bannedAt: null,
        id: { not: viewer.id, notIn: Array.from(blockedIds) },
        profile: { isNot: null },
      },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        avatarUrl: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        profile: {
          select: {
            narrativeFocused: true, characterFocused: true, messageFocused: true,
            cinematicFocused: true, performanceFocused: true, entertainmentFocused: true,
            genreAction: true, genreHorror: true, genreDrama: true, genreHistorical: true,
            genreScifi: true, genreThriller: true, genreComedy: true, genreBookAdapt: true,
            genreFantasy: true, genreRomance: true, genreDocumentary: true, genreFamily: true,
            genreFilmNoir: true, genreMusical: true, genreBiopic: true, genreCrime: true,
            genreWestern: true, genreMystery: true, genreAnimation: true,
          },
        },
        _count: { select: { followers: true, ratings: true, tvShowRatings: true } },
      },
    });

    // Pre-fetch which candidates the viewer follows so we can stamp
    // isFollowing into the response in one query instead of forcing
    // the client to fan out a GET per row (the previous shape made N
    // round-trips and was reading the wrong response key, so every
    // row rendered as Not Following).
    const candidateIds = candidates.map((c) => c.id);
    const followsRaw = candidateIds.length > 0
      ? await prisma.userFollow.findMany({
          where: { followerId: viewer.id, followingId: { in: candidateIds }, status: "accepted" },
          select: { followingId: true },
        })
      : [];
    const followingIds = new Set(followsRaw.map((f) => f.followingId));

    // Full Ratist rating count per candidate. Used for BOTH the
    // critic chip (active sub + >= CRITIC_RATING_THRESHOLD) AND the
    // data-sufficient sort tier (>= LOW_RATING_THRESHOLD). Quick /
    // basic ratings don't count toward either — they don't carry
    // the subfield signal that drives the rest of the math.
    // Batched as two groupBys over all candidates so we don't fan
    // out N round-trips.
    const fullRatingCounts = new Map<string, number>();
    if (candidateIds.length > 0) {
      const [movieGrouped, tvGrouped] = await Promise.all([
        prisma.movieRating.groupBy({
          by: ["userId"],
          where: { userId: { in: candidateIds }, plot: { not: null } },
          _count: { _all: true },
        }),
        prisma.tVShowRating.groupBy({
          by: ["userId"],
          where: { userId: { in: candidateIds }, plot: { not: null }, ratingScope: "series" },
          _count: { _all: true },
        }),
      ]);
      for (const row of movieGrouped) fullRatingCounts.set(row.userId, (fullRatingCounts.get(row.userId) ?? 0) + row._count._all);
      for (const row of tvGrouped) fullRatingCounts.set(row.userId, (fullRatingCounts.get(row.userId) ?? 0) + row._count._all);
    }
    const subActiveIds = new Set(candidates.filter(isSubscriptionActive).map((c) => c.id));
    const criticIds = new Set<string>();
    for (const [userId, count] of fullRatingCounts) {
      if (count >= CRITIC_RATING_THRESHOLD && subActiveIds.has(userId)) criticIds.add(userId);
    }

    // Score every candidate against the viewer's profile. The math
    // mirrors /api/profile/match: average dimensionSimilarity over 6
    // component + 19 genre dimensions, then ×100.
    const allKeys = [...COMPONENT_KEYS, ...GENRE_KEYS] as const;
    const scored: DiscoveryUser[] = [];
    for (const c of candidates) {
      if (!c.profile) continue;
      const sims = allKeys.map((key) => dimensionSimilarity(myProfile[key], c.profile![key]));
      const match = Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 100);
      scored.push({
        id: c.id,
        firebaseUid: c.firebaseUid,
        name: c.name,
        avatarUrl: c.avatarUrl,
        match,
        followerCount: c._count.followers,
        isCritic: criticIds.has(c.id),
        fullRatistCount: fullRatingCounts.get(c.id) ?? 0,
        isFollowing: followingIds.has(c.id),
      });
    }

    // Tiered sort:
    //   1. Data-sufficient users (>= LOW_RATING_THRESHOLD FULL Ratist
    //      ratings) come ahead of limited-data users. A user with a
    //      pile of quick ratings has high-looking match math but no
    //      real subfield signal — the profile rebuild stands in
    //      community averages for them, which produces inflated /
    //      uniform component scores. Keep them in the list, just
    //      below everyone with real signal.
    //   2. Within each tier, match % descending.
    //   3. Tiebreaker: more full ratings wins (more confidence).
    scored.sort((a, b) => {
      const aHasData = a.fullRatistCount >= LOW_RATING_THRESHOLD ? 1 : 0;
      const bHasData = b.fullRatistCount >= LOW_RATING_THRESHOLD ? 1 : 0;
      if (aHasData !== bHasData) return bHasData - aHasData;
      const matchDiff = (b.match ?? 0) - (a.match ?? 0);
      if (matchDiff !== 0) return matchDiff;
      return b.fullRatistCount - a.fullRatistCount;
    });

    const page = scored.slice(cursor, cursor + PAGE_SIZE);
    const hasMore = scored.length > cursor + PAGE_SIZE;
    return NextResponse.json({ users: page, hasMore, needsProfile: false, threshold: LOW_RATING_THRESHOLD });
  } catch (err) {
    console.error("Discovery twins error:", err);
    return NextResponse.json({ users: [], hasMore: false, needsProfile: false }, { status: 500 });
  }
}

