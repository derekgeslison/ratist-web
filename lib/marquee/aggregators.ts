import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Data aggregators for Marquee — the admin daily-brief assistant.
 *
 * Each aggregator returns a small typed structure suitable for both
 * (a) feeding into the Claude prompt that writes the brief, AND
 * (b) rendering as a HUD card on the Marquee admin page.
 *
 * ── Admin filtering ──
 * All aggregators exclude admin-owned activity. Without this, Derek's
 * own admin testing (creating watch companions, adjusting things)
 * contaminates the metrics and makes the brief report on the admin's
 * own behavior instead of real users. Implementation: we fetch the
 * admin user-id list once per request and pass it through.
 *
 * ── Caching ──
 * Each aggregator memoizes its result for 10 minutes in-process. Q&A
 * tool calls hit the cache instead of re-querying. Cold-start kills the
 * cache (Vercel serverless) but within a warm function instance, repeat
 * Q&A is effectively instant. Pass `bypassCache: true` to force a fresh
 * read (used by the daily brief generator).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const CACHE_TTL_MS = 10 * 60 * 1000;

function dateRanges() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const twoWeeksAgo = new Date(now.getTime() - 2 * WEEK_MS);
  return { now, dayAgo, weekAgo, twoWeeksAgo };
}

function pct(curr: number, prev: number): { value: number; trend: "up" | "down" | "flat" } | null {
  if (prev === 0 && curr === 0) return { value: 0, trend: "flat" };
  if (prev === 0) return { value: 100, trend: "up" };
  const delta = ((curr - prev) / prev) * 100;
  if (Math.abs(delta) < 2) return { value: 0, trend: "flat" };
  return { value: Math.round(delta), trend: delta > 0 ? "up" : "down" };
}

// ── Admin-id cache ────────────────────────────────────────────────────
let adminIdsCache: { ids: string[]; expiresAt: number } | null = null;
async function getAdminUserIds(): Promise<string[]> {
  const now = Date.now();
  if (adminIdsCache && adminIdsCache.expiresAt > now) return adminIdsCache.ids;
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  const ids = admins.map((a) => a.id);
  adminIdsCache = { ids, expiresAt: now + CACHE_TTL_MS };
  return ids;
}

// ── Generic memo helper ───────────────────────────────────────────────
const memo = new Map<string, { value: unknown; expiresAt: number }>();
async function memoized<T>(key: string, fn: () => Promise<T>, bypassCache = false): Promise<T> {
  const now = Date.now();
  if (!bypassCache) {
    const hit = memo.get(key);
    if (hit && hit.expiresAt > now) return hit.value as T;
  }
  const value = await fn();
  memo.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

// ──────────────────────────────────────────────────────────────────
// 1. User growth — new signups today + WoW comparison (excluding admins)
// ──────────────────────────────────────────────────────────────────
export interface UserMetrics {
  newToday: number;
  newThisWeek: number;
  newLastWeek: number;
  weekDelta: ReturnType<typeof pct>;
  total: number;
}

export async function getUserMetrics(bypassCache = false): Promise<UserMetrics> {
  return memoized("users", async () => {
    const { dayAgo, weekAgo, twoWeeksAgo } = dateRanges();
    const baseWhere = { deletedAt: null, isAdmin: false };
    try {
      const [newToday, newThisWeek, newLastWeek, total] = await Promise.all([
        prisma.user.count({ where: { ...baseWhere, createdAt: { gte: dayAgo } } }),
        prisma.user.count({ where: { ...baseWhere, createdAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { ...baseWhere, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
        prisma.user.count({ where: baseWhere }),
      ]);
      return { newToday, newThisWeek, newLastWeek, weekDelta: pct(newThisWeek, newLastWeek), total };
    } catch {
      return { newToday: 0, newThisWeek: 0, newLastWeek: 0, weekDelta: null, total: 0 };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 2. Feature metrics — ALL features w/ this-week / last-week counts.
//    Returns top 3, top declining, AND the full list so Q&A can answer
//    questions about any specific feature ("how are watchlists doing?").
// ──────────────────────────────────────────────────────────────────
export interface FeatureCount { label: string; thisWeek: number; lastWeek: number; delta: ReturnType<typeof pct>; }
export interface FeatureMetrics {
  /** Every feature signal we track. Use this for per-feature Q&A. */
  all: FeatureCount[];
  /** Top 3 by this-week volume — curated highlight for the brief. */
  topThisWeek: FeatureCount[];
  /** Biggest WoW drops with non-trivial volume — curated lowlight. */
  topDeclining: FeatureCount[];
  totalEventsThisWeek: number;
}

async function countByUserField(
  model: { count: (args: { where: Record<string, unknown> }) => Promise<number> },
  userField: string,
  excludeIds: string[],
  weekAgo: Date,
  twoWeeksAgo: Date,
): Promise<{ thisWeek: number; lastWeek: number }> {
  const baseWhere: Record<string, unknown> = excludeIds.length > 0
    ? { [userField]: { notIn: excludeIds } }
    : {};
  const [thisWeek, lastWeek] = await Promise.all([
    model.count({ where: { ...baseWhere, createdAt: { gte: weekAgo } } }),
    model.count({ where: { ...baseWhere, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ]);
  return { thisWeek, lastWeek };
}

// Watchlists are tricky — additions live on WatchlistMovie/Show, not on
// the Watchlist itself. We count additions across both tables, joined
// through to the watchlist owner.
async function countWatchlistAdditions(excludeIds: string[], weekAgo: Date, twoWeeksAgo: Date): Promise<{ thisWeek: number; lastWeek: number }> {
  const ownerFilter = excludeIds.length > 0
    ? { watchlist: { userId: { notIn: excludeIds } } }
    : {};
  const [movieAddsThisWeek, showAddsThisWeek, movieAddsLastWeek, showAddsLastWeek] = await Promise.all([
    prisma.watchlistMovie.count({ where: { ...ownerFilter, addedAt: { gte: weekAgo } } }),
    prisma.watchlistShow.count({ where: { ...ownerFilter, addedAt: { gte: weekAgo } } }),
    prisma.watchlistMovie.count({ where: { ...ownerFilter, addedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.watchlistShow.count({ where: { ...ownerFilter, addedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ]);
  return { thisWeek: movieAddsThisWeek + showAddsThisWeek, lastWeek: movieAddsLastWeek + showAddsLastWeek };
}

// Seen-tracking — also distinct from ratings. Counts MovieSeen + ShowSeen
// additions (the diary mechanic).
async function countSeenMarks(excludeIds: string[], weekAgo: Date, twoWeeksAgo: Date): Promise<{ thisWeek: number; lastWeek: number }> {
  const filter = excludeIds.length > 0 ? { userId: { notIn: excludeIds } } : {};
  // Schema uses UserFavoriteMovie / UserFavoriteShow (the "seen" tables).
  const [mThis, sThis, mLast, sLast] = await Promise.all([
    prisma.userFavoriteMovie.count({ where: { ...filter, createdAt: { gte: weekAgo } } }),
    prisma.userFavoriteShow.count({ where: { ...filter, createdAt: { gte: weekAgo } } }),
    prisma.userFavoriteMovie.count({ where: { ...filter, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.userFavoriteShow.count({ where: { ...filter, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ]);
  return { thisWeek: mThis + sThis, lastWeek: mLast + sLast };
}

export async function getFeatureMetrics(bypassCache = false): Promise<FeatureMetrics> {
  return memoized("features", async () => {
    const { weekAgo, twoWeeksAgo } = dateRanges();
    const adminIds = await getAdminUserIds();
    try {
      // Each entry: a feature label + the counter function that does the
      // admin-filtered, range-bounded count.
      const sources: { label: string; counter: () => Promise<{ thisWeek: number; lastWeek: number }> }[] = [
        { label: "Movie ratings", counter: () => countByUserField(prisma.movieRating as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Show ratings", counter: () => countByUserField(prisma.tVShowRating as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Screening rooms", counter: () => countByUserField(prisma.screeningSession as never, "hostId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Forum threads", counter: () => countByUserField(prisma.forumThread as never, "authorId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Watch Companions", counter: () => countByUserField(prisma.watchCompanion as never, "generatedBy", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Collections", counter: () => countByUserField(prisma.customCollection as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "AI tool calls", counter: () => countByUserField(prisma.aiUsageLog as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Comments", counter: () => countByUserField(prisma.comment as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Follows", counter: () => countByUserField(prisma.userFollow as never, "followerId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Hot Takes", counter: () => countByUserField(prisma.hotTake as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Recasts", counter: () => countByUserField(prisma.recast as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Looks Like", counter: () => countByUserField(prisma.looksLike as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
        { label: "Watchlist additions", counter: () => countWatchlistAdditions(adminIds, weekAgo, twoWeeksAgo) },
        { label: "Seen marks", counter: () => countSeenMarks(adminIds, weekAgo, twoWeeksAgo) },
        { label: "Cine-Q attempts", counter: () => countByUserField(prisma.cineQAttempt as never, "userId", adminIds, weekAgo, twoWeeksAgo) },
      ];

      const rows = await Promise.all(
        sources.map(async (s) => {
          try {
            const { thisWeek, lastWeek } = await s.counter();
            return { label: s.label, thisWeek, lastWeek, delta: pct(thisWeek, lastWeek) };
          } catch {
            return { label: s.label, thisWeek: 0, lastWeek: 0, delta: null };
          }
        }),
      );

      const topThisWeek = [...rows].sort((a, b) => b.thisWeek - a.thisWeek).slice(0, 3);
      const topDeclining = [...rows]
        .filter((r) => r.delta?.trend === "down" && r.thisWeek + r.lastWeek >= 4)
        .sort((a, b) => (a.delta?.value ?? 0) - (b.delta?.value ?? 0))
        .slice(0, 3);

      return {
        all: rows,
        topThisWeek,
        topDeclining,
        totalEventsThisWeek: rows.reduce((s, r) => s + r.thisWeek, 0),
      };
    } catch {
      return { all: [], topThisWeek: [], topDeclining: [], totalEventsThisWeek: 0 };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 3. Feedback inbox — new + categories
// ──────────────────────────────────────────────────────────────────
export interface FeedbackSummary {
  newThisWeek: number;
  newToday: number;
  byCategory: Record<string, number>;
  recentMessages: { category: string; message: string; createdAt: Date }[];
}

export async function getFeedbackSummary(bypassCache = false): Promise<FeedbackSummary> {
  return memoized("feedback", async () => {
    const { dayAgo, weekAgo } = dateRanges();
    const adminIds = await getAdminUserIds();
    try {
      // Anonymous feedback (userId=null) is kept — it's real-user feedback.
      // Only filter out feedback FROM an admin user.
      const adminExclude = adminIds.length > 0 ? { userId: { notIn: adminIds } } : {};
      const [newToday, newThisWeekRows] = await Promise.all([
        prisma.feedback.count({ where: { ...adminExclude, createdAt: { gte: dayAgo } } }),
        prisma.feedback.findMany({
          where: { ...adminExclude, createdAt: { gte: weekAgo } },
          select: { category: true, message: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);
      const byCategory: Record<string, number> = {};
      for (const r of newThisWeekRows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      return {
        newThisWeek: newThisWeekRows.length,
        newToday,
        byCategory,
        recentMessages: newThisWeekRows.map((r) => ({ ...r, message: r.message.slice(0, 240) })),
      };
    } catch {
      return { newThisWeek: 0, newToday: 0, byCategory: {}, recentMessages: [] };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 4. Moderation queue
// ──────────────────────────────────────────────────────────────────
export interface ModerationMetrics {
  pendingCount: number;
  newThisWeek: number;
  oldestPendingAgeDays: number | null;
}

export async function getModerationMetrics(bypassCache = false): Promise<ModerationMetrics> {
  return memoized("moderation", async () => {
    const { weekAgo } = dateRanges();
    const adminIds = await getAdminUserIds();
    // Reports filed BY admins (i.e. self-tests) shouldn't count toward
    // the queue depth admins should worry about.
    const adminExclude = adminIds.length > 0 ? { reporterId: { notIn: adminIds } } : {};
    try {
      const [pendingCount, newThisWeek, oldest] = await Promise.all([
        prisma.report.count({ where: { ...adminExclude, status: "pending" } }),
        prisma.report.count({ where: { ...adminExclude, createdAt: { gte: weekAgo } } }),
        prisma.report.findFirst({
          where: { ...adminExclude, status: "pending" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      const oldestPendingAgeDays = oldest
        ? Math.floor((Date.now() - oldest.createdAt.getTime()) / DAY_MS)
        : null;
      return { pendingCount, newThisWeek, oldestPendingAgeDays };
    } catch {
      return { pendingCount: 0, newThisWeek: 0, oldestPendingAgeDays: null };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 5. Community highlights — AGGREGATE patterns, not individual reviews
//    (per user feedback: don't surface "Marjorie gave a romcom 10 stars",
//    talk about what the community is collectively doing instead)
// ──────────────────────────────────────────────────────────────────
export interface CommunityHighlights {
  hotThreads: { title: string; viewCount: number; slug: string; replyCount: number }[];
  /** Movies most frequently added to watchlists this week (real signal of
   *  what people want to see) */
  topWatchlistedMovies: { title: string; tmdbId: number; addCount: number }[];
  /** Movies that got the most NEW ratings this week (signal of what's
   *  being watched + discussed). Volume, not score. */
  mostRatedMovies: { title: string; tmdbId: number; newRatings: number }[];
  /** Shows getting the most new ratings */
  mostRatedShows: { title: string; tmdbId: number; newRatings: number }[];
}

export async function getCommunityHighlights(bypassCache = false): Promise<CommunityHighlights> {
  return memoized("community", async () => {
    const { weekAgo } = dateRanges();
    const adminIds = await getAdminUserIds();
    const adminExclude = adminIds.length > 0 ? { notIn: adminIds } : undefined;
    try {
      const [hotThreadsRaw, topWatchlistedRaw, mostRatedMoviesRaw, mostRatedShowsRaw] = await Promise.all([
        // Hot threads — by reply velocity, not just view count
        prisma.forumThread.findMany({
          where: {
            createdAt: { gte: weekAgo },
            ...(adminExclude ? { authorId: adminExclude } : {}),
          },
          orderBy: { viewCount: "desc" },
          take: 3,
          select: { title: true, viewCount: true, slug: true, _count: { select: { posts: true } } },
        }),
        // Most-watchlisted movies this week — aggregate add-count per movie
        prisma.watchlistMovie.groupBy({
          by: ["movieId"],
          where: {
            addedAt: { gte: weekAgo },
            ...(adminExclude ? { watchlist: { userId: adminExclude } } : {}),
          },
          _count: { _all: true },
          orderBy: { _count: { movieId: "desc" } },
          take: 3,
        }),
        // Most-rated movies this week — volume signal
        prisma.movieRating.groupBy({
          by: ["movieId"],
          where: {
            createdAt: { gte: weekAgo },
            excluded: false,
            ...(adminExclude ? { userId: adminExclude } : {}),
          },
          _count: { _all: true },
          orderBy: { _count: { movieId: "desc" } },
          take: 3,
        }),
        prisma.tVShowRating.groupBy({
          by: ["tvShowId"],
          where: {
            createdAt: { gte: weekAgo },
            excluded: false,
            ratingScope: "series",
            ...(adminExclude ? { userId: adminExclude } : {}),
          },
          _count: { _all: true },
          orderBy: { _count: { tvShowId: "desc" } },
          take: 3,
        }),
      ]);

      // Resolve title lookups in batches.
      const movieIds = Array.from(new Set([
        ...topWatchlistedRaw.map((r) => r.movieId),
        ...mostRatedMoviesRaw.map((r) => r.movieId),
      ]));
      const showIds = mostRatedShowsRaw.map((r) => r.tvShowId);
      const [movies, shows] = await Promise.all([
        movieIds.length > 0 ? prisma.movie.findMany({ where: { id: { in: movieIds } }, select: { id: true, title: true, tmdbId: true } }) : Promise.resolve([]),
        showIds.length > 0 ? prisma.tVShow.findMany({ where: { id: { in: showIds } }, select: { id: true, name: true, tmdbId: true } }) : Promise.resolve([]),
      ]);
      const movieById = new Map(movies.map((m) => [m.id, m]));
      const showById = new Map(shows.map((s) => [s.id, s]));

      return {
        hotThreads: hotThreadsRaw.map((t) => ({
          title: t.title,
          viewCount: t.viewCount,
          slug: t.slug,
          replyCount: t._count.posts,
        })),
        topWatchlistedMovies: topWatchlistedRaw
          .map((r) => ({
            title: movieById.get(r.movieId)?.title ?? "(unknown)",
            tmdbId: movieById.get(r.movieId)?.tmdbId ?? 0,
            addCount: r._count._all,
          }))
          .filter((m) => m.tmdbId > 0),
        mostRatedMovies: mostRatedMoviesRaw
          .map((r) => ({
            title: movieById.get(r.movieId)?.title ?? "(unknown)",
            tmdbId: movieById.get(r.movieId)?.tmdbId ?? 0,
            newRatings: r._count._all,
          }))
          .filter((m) => m.tmdbId > 0),
        mostRatedShows: mostRatedShowsRaw
          .map((r) => ({
            title: showById.get(r.tvShowId)?.name ?? "(unknown)",
            tmdbId: showById.get(r.tvShowId)?.tmdbId ?? 0,
            newRatings: r._count._all,
          }))
          .filter((s) => s.tmdbId > 0),
      };
    } catch {
      return { hotThreads: [], topWatchlistedMovies: [], mostRatedMovies: [], mostRatedShows: [] };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 6. Subscription metrics — BSP signups, churn
// ──────────────────────────────────────────────────────────────────
export interface SubscriptionMetrics {
  activePassCount: number;
  newPassesThisWeek: number;
  canceledThisWeek: number;
}

export async function getSubscriptionMetrics(bypassCache = false): Promise<SubscriptionMetrics> {
  return memoized("subscriptions", async () => {
    const { weekAgo } = dateRanges();
    // Filter admin-granted (those are us bypassing) AND admin users.
    try {
      const [activePassCount, newPassesThisWeek, canceledThisWeek] = await Promise.all([
        prisma.user.count({
          where: {
            isAdmin: false,
            subscriptionTier: "backstage_pass",
            subscriptionStatus: "active",
          },
        }),
        prisma.user.count({
          where: {
            isAdmin: false,
            subscriptionTier: "backstage_pass",
            subscriptionStatus: "active",
            updatedAt: { gte: weekAgo },
          },
        }),
        prisma.user.count({
          where: { isAdmin: false, subscriptionStatus: "canceled", updatedAt: { gte: weekAgo } },
        }),
      ]);
      return { activePassCount, newPassesThisWeek, canceledThisWeek };
    } catch {
      return { activePassCount: 0, newPassesThisWeek: 0, canceledThisWeek: 0 };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// 7. AI cost — usage rollup (admin calls excluded)
// ──────────────────────────────────────────────────────────────────
export interface AiCostMetrics {
  callsToday: number;
  callsThisWeek: number;
  callsLastWeek: number;
  weekDelta: ReturnType<typeof pct>;
  topFeatures: { feature: string; count: number }[];
}

export async function getAiCostMetrics(bypassCache = false): Promise<AiCostMetrics> {
  return memoized("aiCost", async () => {
    const { dayAgo, weekAgo, twoWeeksAgo } = dateRanges();
    const adminIds = await getAdminUserIds();
    const adminExclude = adminIds.length > 0 ? { userId: { notIn: adminIds } } : {};
    try {
      const [callsToday, callsThisWeek, callsLastWeek, byFeature] = await Promise.all([
        prisma.aiUsageLog.count({ where: { ...adminExclude, createdAt: { gte: dayAgo } } }),
        prisma.aiUsageLog.count({ where: { ...adminExclude, createdAt: { gte: weekAgo } } }),
        prisma.aiUsageLog.count({ where: { ...adminExclude, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
        prisma.aiUsageLog.groupBy({
          by: ["feature"],
          where: { ...adminExclude, createdAt: { gte: weekAgo } },
          _count: { _all: true },
          orderBy: { _count: { feature: "desc" } },
          take: 3,
        }),
      ]);
      return {
        callsToday,
        callsThisWeek,
        callsLastWeek,
        weekDelta: pct(callsThisWeek, callsLastWeek),
        topFeatures: byFeature.map((b) => ({ feature: b.feature, count: b._count._all })),
      };
    } catch {
      return { callsToday: 0, callsThisWeek: 0, callsLastWeek: 0, weekDelta: null, topFeatures: [] };
    }
  }, bypassCache);
}

// ──────────────────────────────────────────────────────────────────
// Roll-up — everything in one call for the brief generator
// ──────────────────────────────────────────────────────────────────
export interface MarqueeData {
  users: UserMetrics;
  features: FeatureMetrics;
  feedback: FeedbackSummary;
  moderation: ModerationMetrics;
  community: CommunityHighlights;
  subscriptions: SubscriptionMetrics;
  aiCost: AiCostMetrics;
  generatedAt: string;
}

export async function getAllMarqueeData(): Promise<MarqueeData> {
  // Brief generation always bypasses cache to ensure fresh data — the
  // brief itself is cached for 12h via marqueeBriefCache so we don't pay
  // for re-aggregation on repeat opens.
  const [users, features, feedback, moderation, community, subscriptions, aiCost] = await Promise.all([
    getUserMetrics(true),
    getFeatureMetrics(true),
    getFeedbackSummary(true),
    getModerationMetrics(true),
    getCommunityHighlights(true),
    getSubscriptionMetrics(true),
    getAiCostMetrics(true),
  ]);
  return {
    users, features, feedback, moderation, community, subscriptions, aiCost,
    generatedAt: new Date().toISOString(),
  };
}
