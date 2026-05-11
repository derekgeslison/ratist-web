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

  // Parallel count queries — one per candidate. Each returns a number.
  const [
    ratingsMovies, ratingsShows,
    watchlistMovies, watchlistShows,
    diary,
    rankings,
    forumThreads, forumPosts,
    recommend,
    collections,
    screeningHosted, screeningJoined,
    cineq,
    movieClub,
  ] = await Promise.all([
    prisma.movieRating.count({ where: { userId: user.id } }),
    prisma.tVShowRating.count({ where: { userId: user.id } }),
    prisma.watchlistMovie.count({ where: { watchlist: { userId: user.id } } }),
    prisma.watchlistShow.count({ where: { watchlist: { userId: user.id } } }),
    prisma.userWatchLog.count({ where: { userId: user.id } }),
    prisma.userMovieRanking.count({ where: { userId: user.id } }),
    prisma.forumThread.count({ where: { authorId: user.id } }),
    prisma.forumPost.count({ where: { authorId: user.id } }),
    prisma.aiUsageLog.count({ where: { userId: user.id, feature: "recommend" } }),
    prisma.customCollection.count({ where: { userId: user.id } }),
    prisma.screeningSession.count({ where: { hostId: user.id } }),
    prisma.screeningParticipant.count({ where: { userId: user.id } }),
    prisma.cineQAttempt.count({ where: { userId: user.id } }),
    hasPass ? prisma.movieClubRating.count({ where: { userId: user.id } }) : Promise.resolve(0),
  ]);

  const counts: Record<CandidateId, number> = {
    ratings:    ratingsMovies + ratingsShows,
    watchlist:  watchlistMovies + watchlistShows,
    diary,
    rankings,
    forum:      forumThreads + forumPosts,
    recommend,
    collections,
    screening:  screeningHosted + screeningJoined,
    cineq,
    movieClub,
  };

  // Filter pool by tier (free users never see paid features).
  const pool = CANDIDATES.filter((c) => c.tier === "free" || hasPass);
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
    // Sort the pool by usage DESC, ties broken by CANDIDATES order
    // (i.e. ratings > watchlist > diary > ...) since `pool` preserves
    // that ordering. Take top 2 — these are the user's actual habits.
    const sorted = [...pool].sort((a, b) => counts[b.id] - counts[a.id]);
    const top2 = sorted.slice(0, 2).map((c) => c.id);

    // For the third "engagement nudge" slot, look at the remaining
    // candidates and pick from the lowest-usage ones. Rotate daily so
    // someone who skips a feature today sees a different prompt
    // tomorrow. Multiple zeros tie at the bottom; the day-of-year
    // index selects one within that pool deterministically.
    const remaining = sorted.slice(2);
    const minCount = remaining.length > 0 ? counts[remaining[remaining.length - 1].id] : 0;
    const lowest = remaining.filter((c) => counts[c.id] === minCount);
    const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const nudge = lowest.length > 0
      ? lowest[dayIndex % lowest.length].id
      : remaining[0]?.id;

    pickIds = nudge ? [...top2, nudge] : top2;
  }

  // Hydrate ids into the public shape the client expects.
  const picks = pickIds
    .map((id) => CANDIDATES.find((c) => c.id === id))
    .filter((c): c is (typeof CANDIDATES)[number] => Boolean(c))
    .map((c) => ({ id: c.id, title: c.title, href: c.href, description: c.description }));

  return NextResponse.json({ picks });
}
