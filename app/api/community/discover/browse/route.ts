import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive, activeBackstageUserWhere } from "@/lib/subscription";
import { CRITIC_RATING_THRESHOLD } from "@/lib/watch-companion-trust";
import { dimensionSimilarity } from "@/lib/ratings";
import { Prisma } from "@prisma/client";

/**
 * Unified discovery browse endpoint. Branches on `mode`:
 *   - genre:     ?mode=genre&genreId=27 → users with the most highly-
 *                rated movies in that genre (avg rating × count weight).
 *   - component: ?mode=component&component=narrativeFocused → users
 *                whose taste profile leans heavily into that axis.
 *   - active:    ?mode=active → most ratings submitted in the last 7d.
 *   - newest:    ?mode=newest → recently joined accounts (with at
 *                least one rating to filter out empty signups).
 *   - critics:   ?mode=critics → active Backstage Pass holders with
 *                250+ full Ratist ratings (the same definition the
 *                Critic chip uses elsewhere).
 *
 * Same exclusions as the other discovery surfaces:
 *   - yourself, blocked users (both directions)
 *   - private profiles, opted-out (discoverable=false)
 *   - deleted / banned accounts
 *
 * Returns the same DiscoveryUser shape the twins/search endpoints
 * return, so the client renderer is shared. isFollowing is stamped
 * server-side in one query when the viewer is signed in.
 */

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;
type ComponentKey = typeof COMPONENT_KEYS[number];

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;
const ALL_MATCH_KEYS = [...COMPONENT_KEYS, ...GENRE_KEYS] as const;

const PAGE_SIZE = 30;
const LOW_RATING_THRESHOLD = 10;
// Genre mode requires this many ratings in the target genre before a
// user qualifies — otherwise a single 10-rated horror film makes
// someone "the top horror reviewer" and the ranking is noise.
const MIN_GENRE_RATINGS = 5;
// Active-this-week window.
const ACTIVE_WINDOW_DAYS = 7;

interface DiscoveryUser {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  match: number | null; // not computed in browse modes
  followerCount: number;
  isCritic: boolean;
  ratingCount: number;
  isFollowing: boolean;
}

type MatchProfile = Record<typeof ALL_MATCH_KEYS[number], number>;

interface ScopeData {
  viewerId: string | null;
  blockedIds: Set<string>;
  viewerProfile: MatchProfile | null;
}

async function loadScope(req: NextRequest): Promise<ScopeData> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return { viewerId: null, blockedIds: new Set(), viewerProfile: null };
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const viewer = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!viewer) return { viewerId: null, blockedIds: new Set(), viewerProfile: null };
    const [blocks, profile] = await Promise.all([
      prisma.userBlock.findMany({
        where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.userProfile.findUnique({ where: { userId: viewer.id } }),
    ]);
    const blockedIds = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== viewer.id) blockedIds.add(b.blockerId);
      if (b.blockedId !== viewer.id) blockedIds.add(b.blockedId);
    }
    return {
      viewerId: viewer.id,
      blockedIds,
      viewerProfile: profile as unknown as MatchProfile | null,
    };
  } catch {
    return { viewerId: null, blockedIds: new Set(), viewerProfile: null };
  }
}

/** Shared "fetch a slice of public users by id, in the order given,
 *  + stamp match % (if viewer has a profile), isCritic, isFollowing".
 *  Used by every browse mode after it has decided on the ordered
 *  userId list. The viewer profile is fetched once per request; this
 *  function pulls the visible candidates' profiles in a single query
 *  so the per-row match math is O(slice_size), not O(slice_size × roundtrips). */
async function enrichUsers(
  orderedIds: string[],
  viewerId: string | null,
  viewerProfile: MatchProfile | null,
): Promise<DiscoveryUser[]> {
  if (orderedIds.length === 0) return [];

  const [users, follows, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: orderedIds } },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        avatarUrl: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        _count: { select: { followers: true, ratings: true, tvShowRatings: true } },
      },
    }),
    viewerId
      ? prisma.userFollow.findMany({
          where: { followerId: viewerId, followingId: { in: orderedIds }, status: "accepted" },
          select: { followingId: true },
        })
      : Promise.resolve([] as { followingId: string }[]),
    viewerProfile
      ? prisma.userProfile.findMany({
          where: { userId: { in: orderedIds } },
          select: {
            userId: true,
            narrativeFocused: true, characterFocused: true, messageFocused: true,
            cinematicFocused: true, performanceFocused: true, entertainmentFocused: true,
            genreAction: true, genreHorror: true, genreDrama: true, genreHistorical: true,
            genreScifi: true, genreThriller: true, genreComedy: true, genreBookAdapt: true,
            genreFantasy: true, genreRomance: true, genreDocumentary: true, genreFamily: true,
            genreFilmNoir: true, genreMusical: true, genreBiopic: true, genreCrime: true,
            genreWestern: true, genreMystery: true, genreAnimation: true,
          },
        })
      : Promise.resolve([] as Array<{ userId: string } & MatchProfile>),
  ]);
  const profileByUserId = new Map<string, MatchProfile>();
  for (const p of profiles) {
    const { userId, ...rest } = p as { userId: string } & MatchProfile;
    profileByUserId.set(userId, rest as MatchProfile);
  }

  // Critic chip — same definition as the rest of the site: active
  // sub + >= CRITIC_RATING_THRESHOLD full Ratist ratings.
  const subActiveIds = users.filter(isSubscriptionActive).map((u) => u.id);
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
  const fullCounts = new Map<string, number>();
  for (const r of movieGrouped) fullCounts.set(r.userId, (fullCounts.get(r.userId) ?? 0) + r._count._all);
  for (const r of tvGrouped) fullCounts.set(r.userId, (fullCounts.get(r.userId) ?? 0) + r._count._all);
  const criticIds = new Set<string>();
  for (const [uid, c] of fullCounts) if (c >= CRITIC_RATING_THRESHOLD) criticIds.add(uid);

  const followingIds = new Set(follows.map((f) => f.followingId));
  const byId = new Map(users.map((u) => [u.id, u]));

  // Preserve the order the caller asked for. Match % is computed
  // per-row when both sides have a profile (same math as
  // /api/profile/match: average dimensionSimilarity over 6 component
  // + 19 genre dimensions, then ×100).
  const out: DiscoveryUser[] = [];
  for (const id of orderedIds) {
    const u = byId.get(id);
    if (!u) continue;
    let match: number | null = null;
    if (viewerProfile) {
      const theirProfile = profileByUserId.get(u.id);
      if (theirProfile) {
        const sims = ALL_MATCH_KEYS.map((k) => dimensionSimilarity(viewerProfile[k], theirProfile[k]));
        match = Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 100);
      }
    }
    out.push({
      id: u.id,
      firebaseUid: u.firebaseUid,
      name: u.name,
      avatarUrl: u.avatarUrl,
      match,
      followerCount: u._count.followers,
      isCritic: criticIds.has(u.id),
      ratingCount: u._count.ratings + u._count.tvShowRatings,
      isFollowing: followingIds.has(u.id),
    });
  }
  return out;
}

/** Standard exclusion clause for every mode. */
function exclusionWhere(viewerId: string | null, blockedIds: Set<string>) {
  return {
    isPrivate: false,
    discoverable: true,
    deletedAt: null,
    bannedAt: null,
    ...(viewerId ? { id: { not: viewerId, notIn: Array.from(blockedIds) } } : {}),
  } as const;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "active";
    const cursor = Math.max(0, parseInt(searchParams.get("cursor") ?? "0", 10));
    const { viewerId, blockedIds, viewerProfile } = await loadScope(req);

    switch (mode) {
      case "genre": {
        const genreIdStr = searchParams.get("genreId") ?? "";
        const genreId = parseInt(genreIdStr, 10);
        if (!Number.isFinite(genreId)) return NextResponse.json({ users: [], hasMore: false, threshold: LOW_RATING_THRESHOLD });
        // Aggregate ratings per user that belong to a movie in this
        // genre. Raw SQL is cleaner than chaining groupBy + join here.
        const blockedArr = Array.from(blockedIds);
        const rows = await prisma.$queryRaw<{ user_id: string; avg: number; cnt: bigint }[]>`
          SELECT mr.user_id, AVG(mr.ratist_rating)::float AS avg, COUNT(*)::bigint AS cnt
          FROM movie_ratings mr
          JOIN movie_genres mg ON mg.movie_id = mr.movie_id
          JOIN users u ON u.id = mr.user_id
          WHERE mg.genre_id = ${genreId}
            AND mr.ratist_rating IS NOT NULL
            AND mr.excluded = false
            AND u.is_private = false
            AND u.discoverable = true
            AND u.deleted_at IS NULL
            AND u.banned_at IS NULL
            ${viewerId ? Prisma.sql`AND u.id <> ${viewerId}` : Prisma.empty}
            ${blockedArr.length > 0 ? Prisma.sql`AND u.id <> ALL(${blockedArr}::text[])` : Prisma.empty}
          GROUP BY mr.user_id
          HAVING COUNT(*) >= ${MIN_GENRE_RATINGS}
          ORDER BY avg DESC NULLS LAST, cnt DESC
          LIMIT ${PAGE_SIZE + 1} OFFSET ${cursor}
        `;
        const hasMore = rows.length > PAGE_SIZE;
        const slice = rows.slice(0, PAGE_SIZE);
        const users = await enrichUsers(slice.map((r) => r.user_id), viewerId, viewerProfile);
        return NextResponse.json({ users, hasMore, threshold: LOW_RATING_THRESHOLD });
      }

      case "component": {
        const componentRaw = searchParams.get("component") ?? "";
        const component = (COMPONENT_KEYS as readonly string[]).includes(componentRaw)
          ? (componentRaw as ComponentKey)
          : null;
        if (!component) return NextResponse.json({ users: [], hasMore: false, threshold: LOW_RATING_THRESHOLD });
        const profiles = await prisma.userProfile.findMany({
          where: {
            user: exclusionWhere(viewerId, blockedIds),
          },
          select: { userId: true, [component]: true } as never,
          orderBy: { [component]: "desc" } as never,
          take: PAGE_SIZE + 1,
          skip: cursor,
        }) as Array<Record<string, unknown>>;
        const hasMore = profiles.length > PAGE_SIZE;
        const slice = profiles.slice(0, PAGE_SIZE);
        const orderedIds = slice.map((p) => p.userId as string);
        const users = await enrichUsers(orderedIds, viewerId, viewerProfile);
        return NextResponse.json({ users, hasMore, threshold: LOW_RATING_THRESHOLD });
      }

      case "active": {
        // Count ratings (movie + TV) per user in the last 7 days.
        const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const blockedArr = Array.from(blockedIds);
        const rows = await prisma.$queryRaw<{ user_id: string; cnt: bigint }[]>`
          SELECT user_id, COUNT(*)::bigint AS cnt
          FROM (
            SELECT user_id FROM movie_ratings
              WHERE created_at >= ${since} AND excluded = false
            UNION ALL
            SELECT user_id FROM tv_show_ratings
              WHERE created_at >= ${since} AND excluded = false AND rating_scope = 'series'
          ) combined
          JOIN users u ON u.id = combined.user_id
          WHERE u.is_private = false
            AND u.discoverable = true
            AND u.deleted_at IS NULL
            AND u.banned_at IS NULL
            ${viewerId ? Prisma.sql`AND u.id <> ${viewerId}` : Prisma.empty}
            ${blockedArr.length > 0 ? Prisma.sql`AND u.id <> ALL(${blockedArr}::text[])` : Prisma.empty}
          GROUP BY user_id
          ORDER BY cnt DESC
          LIMIT ${PAGE_SIZE + 1} OFFSET ${cursor}
        `;
        const hasMore = rows.length > PAGE_SIZE;
        const slice = rows.slice(0, PAGE_SIZE);
        const users = await enrichUsers(slice.map((r) => r.user_id), viewerId, viewerProfile);
        return NextResponse.json({ users, hasMore, threshold: LOW_RATING_THRESHOLD });
      }

      case "newest": {
        // Recently joined accounts with at least one rating. The
        // "with rating" filter keeps zombie sign-ups out of the
        // surface so newcomers actually engaged with the product
        // get the spotlight.
        const recent = await prisma.user.findMany({
          where: {
            ...exclusionWhere(viewerId, blockedIds),
            OR: [
              { ratings: { some: {} } },
              { tvShowRatings: { some: {} } },
            ],
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
          take: PAGE_SIZE + 1,
          skip: cursor,
        });
        const hasMore = recent.length > PAGE_SIZE;
        const slice = recent.slice(0, PAGE_SIZE);
        const users = await enrichUsers(slice.map((r) => r.id), viewerId, viewerProfile);
        return NextResponse.json({ users, hasMore, threshold: LOW_RATING_THRESHOLD });
      }

      case "critics": {
        // Find all active-subscription public users, then filter to
        // those with >= CRITIC_RATING_THRESHOLD full ratings. The
        // count fan-out is the same one enrichUsers does, but we
        // need it before pagination to know who qualifies, so it
        // runs here too. activeBackstageUserWhere is the canonical
        // where-clause helper for "currently active Backstage Pass".
        const subbed = await prisma.user.findMany({
          where: {
            ...exclusionWhere(viewerId, blockedIds),
            ...activeBackstageUserWhere(),
          },
          select: {
            id: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            subscriptionExpiry: true,
          },
        });
        const subbedActive = subbed.filter(isSubscriptionActive).map((u) => u.id);
        if (subbedActive.length === 0) return NextResponse.json({ users: [], hasMore: false, threshold: LOW_RATING_THRESHOLD });

        const [movieGrouped, tvGrouped] = await Promise.all([
          prisma.movieRating.groupBy({
            by: ["userId"],
            where: { userId: { in: subbedActive }, plot: { not: null } },
            _count: { _all: true },
          }),
          prisma.tVShowRating.groupBy({
            by: ["userId"],
            where: { userId: { in: subbedActive }, plot: { not: null }, ratingScope: "series" },
            _count: { _all: true },
          }),
        ]);
        const totals = new Map<string, number>();
        for (const r of movieGrouped) totals.set(r.userId, (totals.get(r.userId) ?? 0) + r._count._all);
        for (const r of tvGrouped) totals.set(r.userId, (totals.get(r.userId) ?? 0) + r._count._all);

        const qualified = Array.from(totals.entries())
          .filter(([, c]) => c >= CRITIC_RATING_THRESHOLD)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id);

        const hasMore = qualified.length > cursor + PAGE_SIZE;
        const slice = qualified.slice(cursor, cursor + PAGE_SIZE);
        const users = await enrichUsers(slice, viewerId, viewerProfile);
        return NextResponse.json({ users, hasMore, threshold: LOW_RATING_THRESHOLD });
      }

      default:
        return NextResponse.json({ users: [], hasMore: false, threshold: LOW_RATING_THRESHOLD });
    }
  } catch (err) {
    console.error("Discovery browse error:", err);
    return NextResponse.json({ users: [], hasMore: false }, { status: 500 });
  }
}
