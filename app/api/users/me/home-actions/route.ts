import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Curated home-page action candidates. Order doubles as importance
// tiebreaker when usage counts are tied. Keep this list short — the
// home page surface only renders three buttons.
const CANDIDATES = [
  { id: "ratings",     title: "My Ratings",          href: "/ratings",                   description: "Browse and filter every film and show you've rated",                                 tier: "free" as const },
  { id: "watchlist",   title: "My Watchlist",        href: "/watchlist",                 description: "Movies and shows you want to watch, all in one place",                                tier: "free" as const },
  { id: "diary",       title: "Film Diary",          href: "/seen",                      description: "A timeline of everything you've watched",                                             tier: "free" as const },
  { id: "rankings",    title: "My Rankings",         href: "/tools/rankings",            description: "Your definitive ranked list of everything you've seen",                               tier: "free" as const },
  { id: "forum",       title: "Forum",               href: "/forum",                     description: "Discuss films and shows with the community",                                          tier: "free" as const },
  { id: "recommend",   title: "What Should I Watch?",href: "/tools/recommend",           description: "Personalized picks tuned to your mood, era, and runtime",                             tier: "free" as const },
  { id: "collections", title: "Collections",         href: "/tools/collections",         description: "Curate themed lists of movies and shows",                                             tier: "free" as const },
  { id: "screening",   title: "Screening Room",      href: "/screening-room",            description: "Watch with friends — synced playback, live chat, polls",                              tier: "free" as const },
  { id: "cineq",       title: "Cine-Q",              href: "/community/cineq",           description: "Daily movie trivia — climb the leaderboard",                                          tier: "free" as const },
  { id: "movieClub",   title: "Movie Club",          href: "/backstage-pass/movie-club", description: "Weekly picks, group ratings, and member discussions",                                 tier: "paid" as const },
] as const;

type CandidateId = (typeof CANDIDATES)[number]["id"];

// Defaults for users with zero activity across the board.
const COLD_START: CandidateId[] = ["watchlist", "recommend", "forum"];

// Recency window for "current habits" calculation. We try the last
// 30 days first — if the user has touched at least two distinct
// features in that window, we use those counts. Otherwise we widen
// to all-time so the home page still surfaces something useful for
// users who haven't been active recently.
const RECENT_DAYS = 30;
const MIN_RECENT_FEATURES = 2;

type Counts = Record<CandidateId, number>;

async function getCounts(userId: string, hasPass: boolean, since: Date | null): Promise<Counts> {
  // Pre-build the createdAt / addedAt / joinedAt filter so each query
  // can spread it in. When `since` is null we pass an empty object,
  // which Prisma treats as no filter (all-time count).
  const sinceCreatedAt = since ? { createdAt: { gte: since } } : {};
  const sinceAddedAt = since ? { addedAt: { gte: since } } : {};
  const sinceJoinedAt = since ? { joinedAt: { gte: since } } : {};

  const [
    ratingsMovies, ratingsShows,
    watchlistMovies, watchlistShows,
    diary,
    rankingsLists,
    forumThreads, forumPosts,
    recommend,
    collections,
    screeningHosted, screeningJoined,
    cineq,
    movieClub,
  ] = await Promise.all([
    prisma.movieRating.count({ where: { userId, ...sinceCreatedAt } }),
    prisma.tVShowRating.count({ where: { userId, ...sinceCreatedAt } }),
    prisma.watchlistMovie.count({ where: { watchlist: { userId }, ...sinceAddedAt } }),
    prisma.watchlistShow.count({ where: { watchlist: { userId }, ...sinceAddedAt } }),
    prisma.userWatchLog.count({ where: { userId, ...sinceCreatedAt } }),
    // Rankings: count distinct listKeys all-time (no time filter
    // available — UserMovieRanking has no createdAt column). We
    // groupBy listKey so bulk imports don't inflate the count past
    // "how many ranking lists the user has actually curated", which
    // keeps this on the same scale as the other tiles. Recency-wise
    // this leans toward all-time even when other tiles are 30-day
    // scoped; that's the trade for not adding a migration here.
    prisma.userMovieRanking.groupBy({ by: ["listKey"], where: { userId } }),
    prisma.forumThread.count({ where: { authorId: userId, ...sinceCreatedAt } }),
    prisma.forumPost.count({ where: { authorId: userId, ...sinceCreatedAt } }),
    prisma.aiUsageLog.count({ where: { userId, feature: "recommend", ...sinceCreatedAt } }),
    prisma.customCollection.count({ where: { userId, ...sinceCreatedAt } }),
    prisma.screeningSession.count({ where: { hostId: userId, ...sinceCreatedAt } }),
    prisma.screeningParticipant.count({ where: { userId, ...sinceJoinedAt } }),
    // Cine-Q: only completed attempts count. Open-and-walk-away
    // (status: "in_progress") used to inflate the count without
    // reflecting actual engagement.
    prisma.cineQAttempt.count({ where: { userId, status: "completed", ...sinceCreatedAt } }),
    hasPass ? prisma.movieClubRating.count({ where: { userId, ...sinceCreatedAt } }) : Promise.resolve(0),
  ]);

  return {
    ratings:    ratingsMovies + ratingsShows,
    watchlist:  watchlistMovies + watchlistShows,
    diary,
    rankings:   rankingsLists.length,
    forum:      forumThreads + forumPosts,
    recommend,
    collections,
    screening:  screeningHosted + screeningJoined,
    cineq,
    movieClub,
  };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
    select: { id: true, subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasPass = isSubscriptionActive(user);
  const pool = CANDIDATES.filter((c) => c.tier === "free" || hasPass);

  // Two parallel passes: recent-window + all-time. If the recent
  // pass has enough breadth to populate the top two tiles, we go
  // with it; otherwise we fall back to all-time so the page still
  // reflects who the user is.
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const [recentCounts, allCounts] = await Promise.all([
    getCounts(user.id, hasPass, since),
    getCounts(user.id, hasPass, null),
  ]);
  const recentBreadth = pool.filter((c) => recentCounts[c.id] > 0).length;
  const counts: Counts = recentBreadth >= MIN_RECENT_FEATURES ? recentCounts : allCounts;

  const totalUsage = pool.reduce((s, c) => s + counts[c.id], 0);

  let pickIds: CandidateId[];

  if (totalUsage === 0) {
    // Cold start: curated defaults. Movie Club replaces a default for
    // brand-new subscribers so the paid surface is visible to them.
    pickIds = COLD_START.filter((id) => pool.some((c) => c.id === id));
    if (hasPass && !pickIds.includes("movieClub")) {
      pickIds = (["movieClub", ...pickIds] as CandidateId[]).slice(0, 3);
    } else {
      pickIds = pickIds.slice(0, 3);
    }
  } else {
    // Sort the pool by usage DESC, ties broken by CANDIDATES order.
    const sorted = [...pool].sort((a, b) => counts[b.id] - counts[a.id]);
    let top2 = sorted.slice(0, 2).map((c) => c.id);

    // Dedupe ratings + diary. The rate route auto-creates a
    // UserWatchLog row when watchedDate is set, so heavy raters
    // naturally rank #1 and #2 on these two tiles, which represent
    // the same activity from different angles. Keep the higher of
    // the two; the loser falls through to the nudge pool.
    if (top2.includes("ratings") && top2.includes("diary")) {
      const loser: CandidateId = counts.ratings >= counts.diary ? "diary" : "ratings";
      top2 = sorted.filter((c) => c.id !== loser).slice(0, 2).map((c) => c.id);
    }

    // For the third "engagement nudge" slot, pick from the lowest-
    // usage features still available. Rotate daily so someone who
    // skips a feature today sees a different prompt tomorrow.
    const remaining = pool.filter((c) => !top2.includes(c.id));
    const remainingSorted = [...remaining].sort((a, b) => counts[b.id] - counts[a.id]);
    const minCount = remainingSorted.length > 0 ? counts[remainingSorted[remainingSorted.length - 1].id] : 0;
    const lowest = remainingSorted.filter((c) => counts[c.id] === minCount);
    const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const nudge = lowest.length > 0
      ? lowest[dayIndex % lowest.length].id
      : remainingSorted[0]?.id;

    pickIds = nudge ? [...top2, nudge] : top2;
  }

  const picks = pickIds
    .map((id) => CANDIDATES.find((c) => c.id === id))
    .filter((c): c is (typeof CANDIDATES)[number] => Boolean(c))
    .map((c) => ({ id: c.id, title: c.title, href: c.href, description: c.description }));

  return NextResponse.json({ picks });
}
