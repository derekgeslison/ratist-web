import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { FEATURE_CAPS } from "@/lib/ai/rate-limit";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, newUsersDay, newUsersWeek, newUsersMonth,
    totalRatings, newRatingsDay, newRatingsWeek, totalReviews,
    totalMovies, totalSeenEntries,
    activeSubscribers, newSubscribersWeek, newSubscribersMonth,
    pendingIdeas, pendingReports, openFeedback, openContact, openFraud,
    // content
    publishedPosts, publishedArticles,
    postViewAgg, articleViewAgg, blogLikes, blogComments,
    // community
    looksLikePosts, looksLikeVotes,
    recastPosts, recastVotes,
    hotTakePosts, hotTakeVotes,
    pitchPosts, pitchVotes,
    // forum
    forumThreads, forumThreadsWeek,
    forumPosts, forumPostsWeek,
    forumReactions, forumViewAgg,
    // tools
    screeningSessionsTotal, screeningSessionsWeek,
    cineqAttemptsWeek,
    oscarVotesTotal,
    collectionsTotal,
    rankingListsTotal,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.movieRating.count(),
    prisma.movieRating.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.movieRating.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.movieRating.count({ where: { reviewText: { not: null } } }),
    prisma.movie.count(),
    prisma.userFavoriteMovie.count(),
    prisma.user.count({
      where: {
        subscriptionTier: "backstage_pass",
        subscriptionStatus: { in: ["active", "trialing", "admin_granted"] },
        OR: [{ subscriptionExpiry: null }, { subscriptionExpiry: { gte: now } }],
      },
    }),
    prisma.user.count({
      where: {
        subscriptionTier: "backstage_pass",
        subscriptionStatus: { in: ["active", "trialing", "admin_granted"] },
        updatedAt: { gte: weekAgo },
      },
    }),
    prisma.user.count({
      where: {
        subscriptionTier: "backstage_pass",
        subscriptionStatus: { in: ["active", "trialing", "admin_granted"] },
        updatedAt: { gte: monthAgo },
      },
    }),
    prisma.postIdea.count({ where: { status: "pending" } }),
    prisma.report.count({ where: { status: "pending" } }),
    prisma.feedback.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.contact.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.fraudFlag.count({ where: { status: "open" } }),
    // content
    prisma.blogPost.count({ where: { published: true } }),
    prisma.newsItem.count({ where: { type: "EDITORIAL" } }),
    prisma.blogPost.aggregate({ _sum: { viewCount: true }, where: { published: true } }),
    prisma.newsItem.aggregate({ _sum: { viewCount: true } }),
    prisma.postLike.count({ where: { targetType: "blog" } }),
    prisma.comment.count({ where: { targetType: "blog" } }),
    // community
    prisma.looksLike.count(),
    prisma.looksLikeVote.count(),
    prisma.recast.count(),
    prisma.recastVote.count(),
    prisma.hotTake.count(),
    prisma.hotTakeVote.count(),
    prisma.moviePitch.count(),
    prisma.moviePitchVote.count(),
    // forum
    prisma.forumThread.count(),
    prisma.forumThread.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.forumPost.count(),
    prisma.forumPost.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.forumReaction.count(),
    prisma.forumThread.aggregate({ _sum: { viewCount: true } }),
    // tools
    prisma.screeningSession.count(),
    prisma.screeningSession.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.cineQAttempt.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.oscarVote.count(),
    prisma.customCollection.count(),
    prisma.userRankingList.count(),
  ]);

  // AI heat flag: count distinct users who have hit their daily cap on 4+
  // calendar days in the last 7-day window for any feature. Mirrors the
  // logic shown on /admin/ai-usage.
  const aiFlaggedUsers = await countAiFlaggedUsers(weekAgo);

  // Watch Companion metrics — a separate Promise.all so we don't bloat the
  // outer array. These drive the companion panel on the admin dashboard.
  const [
    companionsPublished,
    companionsDraft,
    companionGensWeek,
    pendingRequests,
    pendingSuggestions,
    mostViewedCompanions,
  ] = await Promise.all([
    prisma.watchCompanion.count({ where: { status: "published" } }),
    prisma.watchCompanion.count({ where: { status: "draft" } }),
    prisma.aiUsageLog.count({ where: { feature: "watch_companion_generate", createdAt: { gte: weekAgo } } }),
    prisma.companionGenerationRequest.count({ where: { status: "pending" } }),
    prisma.companionSuggestion.count({ where: { status: "pending" } }),
    prisma.watchCompanion.findMany({
      where: { status: "published" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, mediaType: true, tmdbId: true, seasonsGenerated: true, _count: { select: { characters: true } } },
    }),
  ]);

  return NextResponse.json({
    users: { total: totalUsers, day: newUsersDay, week: newUsersWeek, month: newUsersMonth },
    ratings: { total: totalRatings, day: newRatingsDay, week: newRatingsWeek, reviews: totalReviews },
    movies: { total: totalMovies },
    seenEntries: totalSeenEntries,
    subscribers: { active: activeSubscribers, week: newSubscribersWeek, month: newSubscribersMonth },
    queues: {
      ideas: pendingIdeas,
      reports: pendingReports,
      feedback: openFeedback,
      contact: openContact,
      fraud: openFraud,
      aiFlagged: aiFlaggedUsers,
    },
    content: {
      publishedPosts,
      publishedArticles,
      postViews: (postViewAgg._sum.viewCount ?? 0) + (articleViewAgg._sum.viewCount ?? 0),
      likes: blogLikes,
      comments: blogComments,
    },
    community: {
      looksLike: { posts: looksLikePosts, votes: looksLikeVotes },
      recast: { posts: recastPosts, votes: recastVotes },
      hotTake: { posts: hotTakePosts, votes: hotTakeVotes },
      pitch: { posts: pitchPosts, votes: pitchVotes },
    },
    forum: {
      threads: forumThreads,
      threadsWeek: forumThreadsWeek,
      posts: forumPosts,
      postsWeek: forumPostsWeek,
      reactions: forumReactions,
      views: forumViewAgg._sum.viewCount ?? 0,
    },
    tools: {
      screeningSessions: screeningSessionsTotal,
      screeningSessionsWeek,
      cineqAttemptsWeek,
      oscarVotes: oscarVotesTotal,
      collections: collectionsTotal,
      rankingLists: rankingListsTotal,
    },
    watchCompanion: {
      published: companionsPublished,
      draft: companionsDraft,
      gensThisWeek: companionGensWeek,
      pendingRequests,
      pendingSuggestions,
      recent: mostViewedCompanions.map((c) => ({
        id: c.id,
        title: c.title,
        mediaType: c.mediaType,
        tmdbId: c.tmdbId,
        seasons: c.seasonsGenerated,
        characters: c._count.characters,
      })),
    },
  });
}

async function countAiFlaggedUsers(since: Date): Promise<number> {
  const logs = await prisma.aiUsageLog.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, feature: true, createdAt: true },
  });
  if (logs.length === 0) return 0;

  // (userId, feature, yyyy-mm-dd) → count
  const dailyCounts = new Map<string, number>();
  for (const row of logs) {
    const day = row.createdAt.toISOString().slice(0, 10);
    const key = `${row.userId}${row.feature}${day}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }

  // Resolve plan per user (only those who have any log rows).
  const userIds = Array.from(new Set(logs.map((r) => r.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true, isAdmin: true, aiDisabled: true,
      subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true,
    },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const daysAtCapByUser = new Map<string, Record<string, number>>();
  for (const [key, count] of dailyCounts) {
    const [uid, feature] = key.split("");
    const caps = FEATURE_CAPS[feature];
    if (!caps) continue;
    const u = userMap.get(uid);
    if (!u || u.isAdmin) continue; // admins don't count
    const isPaid = isSubscriptionActive(u);
    const cap = isPaid ? caps.paidDaily : caps.freeDaily;
    if (cap === 0) continue;
    if (count >= cap) {
      const existing = daysAtCapByUser.get(uid) ?? {};
      existing[feature] = (existing[feature] ?? 0) + 1;
      daysAtCapByUser.set(uid, existing);
    }
  }

  // Flag threshold for a 7-day window: 4 days-at-cap on any feature.
  const FLAG_THRESHOLD = 4;
  let flagged = 0;
  for (const byFeature of daysAtCapByUser.values()) {
    if (Object.values(byFeature).some((d) => d >= FLAG_THRESHOLD)) flagged++;
  }
  return flagged;
}
