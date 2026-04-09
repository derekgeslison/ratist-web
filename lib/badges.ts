import { prisma } from "@/lib/prisma";
// Re-export client-safe types and constants
export { computeTier, TIER_LABELS, TIER_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/badge-defs";
export type { BadgeCategory, BadgeTier } from "@/lib/badge-defs";
import type { BadgeCategory } from "@/lib/badge-defs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BadgeDef {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string; // lucide icon name
  check: (userId: string) => Promise<boolean>;
}

export type TriggerEvent =
  | "seen"
  | "rate"
  | "watchlog"
  | "episode_seen"
  | "follow"
  | "got_followed"
  | "watchlist_add"
  | "lookslike_create"
  | "lookslike_vote"
  | "recast_create"
  | "recast_vote"
  | "hottake_create"
  | "hottake_vote"
  | "pitch_create"
  | "pitch_vote"
  | "screening_end"
  | "cineq_submit"
  | "movie_club_rate"
  | "oscar_vote";

// ─── Check functions ────────────────────────────────────────────────────────

async function checkSeenCount(userId: string, target: number): Promise<boolean> {
  const count = await prisma.userFavoriteMovie.count({ where: { userId } });
  return count >= target;
}

async function checkRatingCount(userId: string, target: number): Promise<boolean> {
  // Only count standard and critic ratings (not basic/quick)
  const count = await prisma.movieRating.count({
    where: { userId, ratistRating: { not: null }, reviewType: { in: ["standard", "critic"] } },
  });
  return count >= target;
}

async function checkQuickDraw(userId: string): Promise<boolean> {
  // Count quick ratings from both movies and TV shows
  const [movieCount, tvCount] = await Promise.all([
    prisma.movieRating.count({ where: { userId, reviewType: "basic" } }),
    prisma.tVShowRating.count({ where: { userId, reviewType: "basic" } }),
  ]);
  return (movieCount + tvCount) >= 10;
}

async function checkFirstWatch(userId: string): Promise<boolean> {
  const count = await prisma.userFavoriteMovie.count({
    where: { userId, watchedDate: { not: null } },
  });
  return count >= 1;
}

async function checkWeeklyRitual(userId: string): Promise<boolean> {
  // Get all seen movie dates (using UserFavoriteMovie as the source of truth)
  const movies = await prisma.userFavoriteMovie.findMany({
    where: { userId, watchedDate: { not: null } },
    select: { watchedDate: true },
  });
  if (movies.length < 4) return false;

  // Bucket by ISO week number
  const weeks = new Set<string>();
  for (const movie of movies) {
    const d = movie.watchedDate!;
    const yearWeek = getISOYearWeek(d);
    weeks.add(yearWeek);
  }

  // Sort weeks and check for 4 consecutive
  const sorted = [...weeks].sort();
  let consecutive = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (isConsecutiveWeek(sorted[i - 1], sorted[i])) {
      consecutive++;
      if (consecutive >= 4) return true;
    } else {
      consecutive = 1;
    }
  }
  return false;
}

function getISOYearWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

function isConsecutiveWeek(a: string, b: string): boolean {
  const [yearA, weekA] = a.split("-W").map(Number);
  const [yearB, weekB] = b.split("-W").map(Number);
  if (yearA === yearB) return weekB === weekA + 1;
  // Handle year boundary (week 52/53 → week 1)
  if (yearB === yearA + 1 && weekB === 1 && weekA >= 52) return true;
  return false;
}

async function checkMarathonRunner(userId: string): Promise<boolean> {
  const movies = await prisma.userFavoriteMovie.findMany({
    where: { userId, watchedDate: { not: null } },
    select: { watchedDate: true },
  });
  if (movies.length < 10) return false;

  // Group by year-month
  const months = new Map<string, number>();
  for (const movie of movies) {
    const d = movie.watchedDate!;
    const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
    months.set(key, (months.get(key) ?? 0) + 1);
  }
  for (const count of months.values()) {
    if (count >= 10) return true;
  }
  return false;
}

async function checkDiaryKeeper(userId: string): Promise<boolean> {
  const count = await prisma.userFavoriteMovie.count({
    where: { userId, watchedDate: { not: null } },
  });
  return count >= 30;
}

async function checkBingeWatcher(userId: string): Promise<boolean> {
  // Find episodes grouped by (showTmdbId, seasonNumber, watchedDate)
  const episodes = await prisma.episodeSeen.findMany({
    where: { userId, watchedDate: { not: null } },
    select: { showTmdbId: true, seasonNumber: true, watchedDate: true },
  });
  if (episodes.length === 0) return false;

  // Group by show+season+date
  const groups = new Map<string, number>();
  const showSeasons = new Set<string>();
  for (const ep of episodes) {
    const dateStr = ep.watchedDate!.toISOString().slice(0, 10);
    const key = `${ep.showTmdbId}::${ep.seasonNumber}::${dateStr}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
    showSeasons.add(`${ep.showTmdbId}::${ep.seasonNumber}`);
  }

  // Check if any group's count matches the full season episode count
  const showTmdbIds = [...new Set(episodes.map((e) => e.showTmdbId))];
  const seasons = await prisma.tVSeason.findMany({
    where: { tvShow: { tmdbId: { in: showTmdbIds } } },
    select: {
      tvShow: { select: { tmdbId: true } },
      seasonNumber: true,
      episodeCount: true,
    },
  });

  const seasonEpCounts = new Map<string, number>();
  for (const s of seasons) {
    if (s.episodeCount && s.episodeCount > 0) {
      seasonEpCounts.set(`${s.tvShow.tmdbId}::${s.seasonNumber}`, s.episodeCount);
    }
  }

  for (const [key, watchedCount] of groups) {
    const [showTmdbId, seasonNum] = key.split("::");
    const seasonKey = `${showTmdbId}::${seasonNum}`;
    const totalEps = seasonEpCounts.get(seasonKey);
    if (totalEps && watchedCount >= totalEps) return true;
  }
  return false;
}

async function checkGenreExplorer(userId: string): Promise<boolean> {
  // Count distinct genres from both movies and TV shows the user has seen
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT genre_id) as count FROM (
      SELECT mg.genre_id
      FROM user_favorite_movies ufm
      JOIN movie_genres mg ON mg.movie_id = ufm.movie_id
      WHERE ufm.user_id = ${userId}
      UNION
      SELECT tsg.genre_id
      FROM user_favorite_shows ufs
      JOIN tv_show_genres tsg ON tsg.tv_show_id = ufs.tv_show_id
      WHERE ufs.user_id = ${userId}
    ) combined
  `;
  return Number(result[0]?.count ?? 0) >= 15;
}

async function checkDecadeDiver(userId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT FLOOR(CAST(LEFT(m.release_date, 4) AS INTEGER) / 10)) as count
    FROM user_favorite_movies ufm
    JOIN movies m ON m.id = ufm.movie_id
    WHERE ufm.user_id = ${userId}
      AND m.release_date IS NOT NULL
      AND LENGTH(m.release_date) >= 4
  `;
  return Number(result[0]?.count ?? 0) >= 6;
}

async function checkDirectorsCut(userId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT MAX(director_count) as count FROM (
      SELECT mc.celebrity_id, COUNT(DISTINCT ufm.movie_id) as director_count
      FROM user_favorite_movies ufm
      JOIN movie_cast mc ON mc.movie_id = ufm.movie_id
      WHERE ufm.user_id = ${userId}
        AND mc.credit_type = 'crew'
        AND mc.job = 'Director'
      GROUP BY mc.celebrity_id
    ) sub
  `;
  return Number(result[0]?.count ?? 0) >= 5;
}

async function checkScreeningParticipant(userId: string, minSessions: number): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_participants sp
    JOIN screening_sessions ss ON ss.id = sp.session_id
    WHERE sp.user_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
  `;
  return Number(result[0]?.count ?? 0) >= minSessions;
}

async function checkScreeningHost(userId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_sessions ss
    WHERE ss.host_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
  `;
  return Number(result[0]?.count ?? 0) >= 1;
}

async function checkPackLeader(userId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_sessions ss
    WHERE ss.host_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
      AND (SELECT COUNT(*) FROM screening_participants sp WHERE sp.session_id = ss.id) >= 4
  `;
  return Number(result[0]?.count ?? 0) >= 1;
}

async function checkContentCreated(
  model: "looksLike" | "recast" | "hotTake" | "moviePitch",
  userId: string,
): Promise<boolean> {
  const fieldMap = {
    looksLike: { model: "looksLike" as const, field: "creatorId" },
    recast: { model: "recast" as const, field: "creatorId" },
    hotTake: { model: "hotTake" as const, field: "authorId" },
    moviePitch: { model: "moviePitch" as const, field: "authorId" },
  };
  const { field } = fieldMap[model];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = await (prisma[model] as any).count({
    where: { [field]: userId },
  });
  return count >= 1;
}

async function checkNetPositiveVotes(
  type: "lookslike" | "recast" | "hottake" | "pitch",
  userId: string,
  threshold: number,
): Promise<boolean> {
  const queries: Record<string, string> = {
    lookslike: `
      SELECT ll.id, COALESCE(SUM(v.value), 0) as net
      FROM looks_likes ll
      LEFT JOIN looks_like_votes v ON v.looks_like_id = ll.id
      WHERE ll.creator_id = $1
      GROUP BY ll.id
      HAVING COALESCE(SUM(v.value), 0) >= $2
      LIMIT 1
    `,
    recast: `
      SELECT r.id, COALESCE(SUM(v.value), 0) as net
      FROM recasts r
      LEFT JOIN recast_votes v ON v.recast_id = r.id
      WHERE r.creator_id = $1
      GROUP BY r.id
      HAVING COALESCE(SUM(v.value), 0) >= $2
      LIMIT 1
    `,
    hottake: `
      SELECT ht.id, COALESCE(SUM(v.value), 0) as net
      FROM hot_takes ht
      LEFT JOIN hot_take_votes v ON v.hot_take_id = ht.id
      WHERE ht.author_id = $1
      GROUP BY ht.id
      HAVING COALESCE(SUM(v.value), 0) >= $2
      LIMIT 1
    `,
    pitch: `
      SELECT mp.id, COALESCE(SUM(v.value), 0) as net
      FROM movie_pitches mp
      LEFT JOIN movie_pitch_votes v ON v.pitch_id = mp.id
      WHERE mp.author_id = $1
      GROUP BY mp.id
      HAVING COALESCE(SUM(v.value), 0) >= $2
      LIMIT 1
    `,
  };

  const result = await prisma.$queryRawUnsafe<{ id: string }[]>(
    queries[type],
    userId,
    threshold,
  );
  return result.length > 0;
}

async function checkContrarian(userId: string): Promise<boolean> {
  // Check if user has any rating that's 3+ points from the TMDB community average
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM movie_ratings mr
    JOIN movies m ON m.id = mr.movie_id
    WHERE mr.user_id = ${userId}
      AND mr.ratist_rating IS NOT NULL
      AND m.vote_average IS NOT NULL
      AND ABS(mr.ratist_rating - m.vote_average) >= 3
    LIMIT 1
  `;
  return Number(result[0]?.count ?? 0) >= 1;
}

async function checkAwardsSeason(userId: string): Promise<boolean> {
  // Check if user has rated all Best Picture nominees for any year
  const bestPictureCategories = await prisma.oscarCategory.findMany({
    where: { slug: "best-picture" },
    select: {
      id: true,
      oscarYearId: true,
      nominees: { select: { tmdbMovieId: true } },
    },
  });

  for (const cat of bestPictureCategories) {
    const tmdbIds = cat.nominees
      .map((n) => n.tmdbMovieId)
      .filter((id): id is number => id !== null);
    if (tmdbIds.length === 0) continue;

    // Find how many of these the user has rated
    const ratedCount = await prisma.movieRating.count({
      where: {
        userId,
        ratistRating: { not: null },
        movie: { tmdbId: { in: tmdbIds } },
      },
    });
    if (ratedCount >= tmdbIds.length) return true;
  }
  return false;
}

async function checkBallotCaster(userId: string): Promise<boolean> {
  // Check if user has voted on all categories for any year
  const years = await prisma.oscarYear.findMany({
    select: {
      id: true,
      categories: { select: { id: true } },
    },
  });

  for (const year of years) {
    if (year.categories.length === 0) continue;
    const voteCount = await prisma.oscarVote.count({
      where: {
        userId,
        categoryId: { in: year.categories.map((c) => c.id) },
      },
    });
    if (voteCount >= year.categories.length) return true;
  }
  return false;
}

async function checkClubMember(userId: string): Promise<boolean> {
  const count = await prisma.movieClubRating.count({ where: { userId } });
  return count >= 10;
}

async function checkHonorStudent(userId: string): Promise<boolean> {
  // Check all combos of mediaType × difficulty exist
  const attempts = await prisma.cineQAttempt.findMany({
    where: { userId, status: "completed" },
    select: { mediaType: true, difficulty: true },
    distinct: ["mediaType", "difficulty"],
  });

  const mediaTypes = ["movie", "tv", "both"];
  const difficulties = ["easy", "medium", "hard"];
  const completedCombos = new Set(attempts.map((a) => `${a.mediaType}::${a.difficulty}`));

  for (const mt of mediaTypes) {
    for (const diff of difficulties) {
      if (!completedCombos.has(`${mt}::${diff}`)) return false;
    }
  }
  return true;
}

async function checkCramSession(userId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ total: number }[]>`
    SELECT SUM(raw_score) as total
    FROM cineq_attempts
    WHERE user_id = ${userId}
      AND status = 'completed'
    GROUP BY DATE(created_at)
    HAVING SUM(raw_score) >= 2000
    LIMIT 1
  `;
  return result.length > 0;
}

async function checkValedictorian(userId: string): Promise<boolean> {
  const result = await prisma.cineQAttempt.aggregate({
    where: { userId, status: "completed" },
    _sum: { rawScore: true },
  });
  return (result._sum.rawScore ?? 0) >= 20000;
}

async function checkFirstFollow(userId: string): Promise<boolean> {
  const count = await prisma.userFollow.count({ where: { followerId: userId } });
  return count >= 1;
}

async function checkInfluencer(userId: string): Promise<boolean> {
  const count = await prisma.userFollow.count({ where: { followingId: userId } });
  return count >= 50;
}

async function checkTheBacklog(userId: string): Promise<boolean> {
  const count = await prisma.watchlistMovie.count({
    where: { watchlist: { userId, isDefault: true } },
  });
  return count >= 25;
}

async function checkCompletionistSupreme(userId: string): Promise<boolean> {
  const count = await prisma.userBadge.count({ where: { userId } });
  return count >= 40; // all other badges
}

// ─── Badge Registry ─────────────────────────────────────────────────────────

export const BADGE_REGISTRY: BadgeDef[] = [
  // ── Watching Milestones ──
  { slug: "moviegoer", name: "Moviegoer", description: "Mark 25 movies as seen", category: "watching", icon: "Popcorn", check: (uid) => checkSeenCount(uid, 25) },
  { slug: "film-fan", name: "Film Fan", description: "Mark 100 movies as seen", category: "watching", icon: "Clapperboard", check: (uid) => checkSeenCount(uid, 100) },
  { slug: "cinephile", name: "Cinephile", description: "Mark 250 movies as seen", category: "watching", icon: "Film", check: (uid) => checkSeenCount(uid, 250) },
  { slug: "film-scholar", name: "Film Scholar", description: "Mark 500 movies as seen", category: "watching", icon: "GraduationCap", check: (uid) => checkSeenCount(uid, 500) },
  { slug: "living-encyclopedia", name: "Living Encyclopedia", description: "Mark 1,000 movies as seen", category: "watching", icon: "BookOpen", check: (uid) => checkSeenCount(uid, 1000) },

  // ── Rating Milestones ──
  { slug: "first-take", name: "First Take", description: "Complete your first Ratist rating", category: "rating", icon: "Star", check: (uid) => checkRatingCount(uid, 1) },
  { slug: "critic-in-training", name: "Critic in Training", description: "Complete 10 Ratist ratings", category: "rating", icon: "PenTool", check: (uid) => checkRatingCount(uid, 10) },
  { slug: "seasoned-critic", name: "Seasoned Critic", description: "Complete 50 Ratist ratings", category: "rating", icon: "Award", check: (uid) => checkRatingCount(uid, 50) },
  { slug: "master-critic", name: "Master Critic", description: "Complete 100 Ratist ratings", category: "rating", icon: "Crown", check: (uid) => checkRatingCount(uid, 100) },
  { slug: "the-completionist", name: "The Completionist", description: "Complete 250 Ratist ratings", category: "rating", icon: "Trophy", check: (uid) => checkRatingCount(uid, 250) },
  { slug: "quick-draw", name: "Quick Draw", description: "Submit 10 quick ratings", category: "rating", icon: "Zap", check: checkQuickDraw },

  // ── Film Diary & Habits ──
  { slug: "first-watch", name: "First Watch", description: "Log your first movie with a watch date", category: "diary", icon: "Calendar", check: checkFirstWatch },
  { slug: "weekly-ritual", name: "Weekly Ritual", description: "Watch a movie every week for 4 consecutive weeks", category: "diary", icon: "CalendarCheck", check: checkWeeklyRitual },
  { slug: "marathon-runner", name: "Marathon Runner", description: "Watch 10+ movies in a single month (dated in diary)", category: "diary", icon: "Timer", check: checkMarathonRunner },
  { slug: "diary-keeper", name: "Diary Keeper", description: "Log watch dates for 30 movies", category: "diary", icon: "BookMarked", check: checkDiaryKeeper },
  { slug: "binge-watcher", name: "Binge Watcher", description: "Watch an entire season of a series in one day", category: "diary", icon: "Tv", check: checkBingeWatcher },

  // ── Exploration ──
  { slug: "genre-explorer", name: "Genre Explorer", description: "See movies in 15+ genres", category: "exploration", icon: "Compass", check: checkGenreExplorer },
  { slug: "decade-diver", name: "Decade Diver", description: "See movies from 6+ decades", category: "exploration", icon: "Clock", check: checkDecadeDiver },
  { slug: "directors-cut", name: "Director's Cut", description: "Watch 5+ movies from the same director", category: "exploration", icon: "Megaphone", check: checkDirectorsCut },

  // ── Screening Room ──
  { slug: "social-butterfly", name: "Social Butterfly", description: "Participate in 5 screening room sessions (each 1hr+)", category: "screening", icon: "Users", check: (uid) => checkScreeningParticipant(uid, 5) },
  { slug: "screening-host", name: "Screening Host", description: "Host your first screening room session (1hr+)", category: "screening", icon: "Monitor", check: checkScreeningHost },
  { slug: "pack-leader", name: "Pack Leader", description: "Host a screening room with 4+ participants (1hr+)", category: "screening", icon: "Shield", check: checkPackLeader },

  // ── Community Tools ──
  { slug: "spotter", name: "Spotter", description: "Submit your first Looks Like pair", category: "community", icon: "Eye", check: (uid) => checkContentCreated("looksLike", uid) },
  { slug: "trendsetter", name: "Trendsetter", description: "Have a Looks Like pair get 50+ net positive votes", category: "community", icon: "TrendingUp", check: (uid) => checkNetPositiveVotes("lookslike", uid, 50) },
  { slug: "casting-director", name: "Casting Director", description: "Submit your first recast", category: "community", icon: "UserCog", check: (uid) => checkContentCreated("recast", uid) },
  { slug: "fan-casting", name: "Fan Casting", description: "Have a recast get 50+ net positive votes", category: "community", icon: "Heart", check: (uid) => checkNetPositiveVotes("recast", uid, 50) },
  { slug: "first-flame", name: "First Flame", description: "Post your first Hot Take", category: "community", icon: "Flame", check: (uid) => checkContentCreated("hotTake", uid) },
  { slug: "fire-starter", name: "Fire Starter", description: "Have a Hot Take get 50+ net positive votes", category: "community", icon: "Sparkles", check: (uid) => checkNetPositiveVotes("hottake", uid, 50) },
  { slug: "the-pitch", name: "The Pitch", description: "Post your first Pitch", category: "community", icon: "Lightbulb", check: (uid) => checkContentCreated("moviePitch", uid) },
  { slug: "green-light", name: "Green Light", description: "Have a Pitch get 50+ net positive votes", category: "community", icon: "CircleDot", check: (uid) => checkNetPositiveVotes("pitch", uid, 50) },

  // ── Personality & Opinion ──
  { slug: "contrarian", name: "Contrarian", description: "Rate a movie 3+ points from the community average", category: "personality", icon: "ArrowUpDown", check: checkContrarian },

  // ── Awards & Events ──
  { slug: "awards-season", name: "Awards Season", description: "Review all Best Picture nominees in a given year", category: "awards", icon: "Medal", check: checkAwardsSeason },
  { slug: "ballot-caster", name: "Ballot Caster", description: "Vote on all Oscar categories in a given year", category: "awards", icon: "Vote", check: checkBallotCaster },
  { slug: "club-member", name: "Club Member", description: "Participate in 10 weeks of Movie Club", category: "awards", icon: "Armchair", check: checkClubMember },

  // ── Cine-Q ──
  { slug: "honor-student", name: "Honor Student", description: "Complete every Cine-Q quiz type on every difficulty", category: "cineq", icon: "Brain", check: checkHonorStudent },
  { slug: "cram-session", name: "Cram Session", description: "Score 2,000+ Cine-Q points in one day", category: "cineq", icon: "BrainCircuit", check: checkCramSession },
  { slug: "valedictorian", name: "Valedictorian", description: "Score 20,000+ Cine-Q points all time", category: "cineq", icon: "GraduationCap", check: checkValedictorian },

  // ── Social ──
  { slug: "first-follow", name: "First Follow", description: "Follow your first user", category: "social", icon: "UserPlus", check: checkFirstFollow },
  { slug: "influencer", name: "Influencer", description: "Reach 50 followers", category: "social", icon: "Megaphone", check: checkInfluencer },

  // ── Watchlist ──
  { slug: "the-backlog", name: "The Backlog", description: "Add 25 movies to your watchlist", category: "watchlist", icon: "ListPlus", check: checkTheBacklog },

  // ── Meta ──
  { slug: "completionist-supreme", name: "Completionist Supreme", description: "Acquire all other badges", category: "meta", icon: "Gem", check: checkCompletionistSupreme },
];

// ─── Trigger Map ────────────────────────────────────────────────────────────

const TRIGGER_MAP: Record<TriggerEvent, string[]> = {
  seen: [
    "moviegoer", "film-fan", "cinephile", "film-scholar", "living-encyclopedia",
    "genre-explorer", "decade-diver", "directors-cut",
  ],
  rate: [
    "first-take", "critic-in-training", "seasoned-critic", "master-critic",
    "the-completionist", "quick-draw", "contrarian",
    "awards-season",
  ],
  watchlog: [
    "first-watch", "weekly-ritual", "marathon-runner", "diary-keeper",
  ],
  episode_seen: ["binge-watcher"],
  follow: ["first-follow"],
  got_followed: ["influencer"],
  watchlist_add: ["the-backlog"],
  lookslike_create: ["spotter"],
  lookslike_vote: ["trendsetter"],
  recast_create: ["casting-director"],
  recast_vote: ["fan-casting"],
  hottake_create: ["first-flame"],
  hottake_vote: ["fire-starter"],
  pitch_create: ["the-pitch"],
  pitch_vote: ["green-light"],
  screening_end: ["social-butterfly", "screening-host", "pack-leader"],
  cineq_submit: ["honor-student", "cram-session", "valedictorian"],
  movie_club_rate: ["club-member"],
  oscar_vote: ["ballot-caster", "awards-season"],
};

// Build a slug → def lookup
const BADGE_MAP = new Map(BADGE_REGISTRY.map((b) => [b.slug, b]));

// ─── Public API ─────────────────────────────────────────────────────────────

export function getAllBadgeDefs(): Omit<BadgeDef, "check">[] {
  return BADGE_REGISTRY.map(({ check: _check, ...rest }) => rest);
}

export function getBadgeDef(slug: string): Omit<BadgeDef, "check"> | undefined {
  const def = BADGE_MAP.get(slug);
  if (!def) return undefined;
  const { check: _check, ...rest } = def;
  return rest;
}

/**
 * Check badges triggered by a specific event and award any newly earned.
 * Fire-and-forget — never throws.
 * Returns array of newly earned badge slugs.
 */
export async function checkBadges(
  userId: string,
  trigger: TriggerEvent,
): Promise<string[]> {
  try {
    const slugsToCheck = TRIGGER_MAP[trigger] ?? [];
    if (slugsToCheck.length === 0) return [];

    // Filter out already-earned badges
    const existing = await prisma.userBadge.findMany({
      where: { userId, slug: { in: slugsToCheck } },
      select: { slug: true },
    });
    const earnedSet = new Set(existing.map((e) => e.slug));
    const unearnedSlugs = slugsToCheck.filter((s) => !earnedSet.has(s));
    if (unearnedSlugs.length === 0) return [];

    // Check each unearned badge
    const newlyEarned: string[] = [];
    for (const slug of unearnedSlugs) {
      const def = BADGE_MAP.get(slug);
      if (!def) continue;
      try {
        const earned = await def.check(userId);
        if (earned) {
          await prisma.userBadge.create({
            data: { userId, slug },
          });
          // Send badge notification (bypass notify() since it blocks self-notifications)
          await prisma.notification.create({
            data: {
              userId,
              type: "badge",
              targetType: "badge",
              targetId: slug,
              message: `You earned the "${def.name}" badge!`,
              link: "/badges",
            },
          });
          newlyEarned.push(slug);
        }
      } catch {
        // Individual badge check failed — skip, don't block others
      }
    }

    // If any badges were earned, check for Completionist Supreme
    if (newlyEarned.length > 0 && !earnedSet.has("completionist-supreme")) {
      try {
        const isComplete = await checkCompletionistSupreme(userId);
        if (isComplete) {
          await prisma.userBadge.create({
            data: { userId, slug: "completionist-supreme" },
          });
          await prisma.notification.create({
            data: {
              userId,
              type: "badge",
              targetType: "badge",
              targetId: "completionist-supreme",
              message: `You earned the "Completionist Supreme" badge! You've collected every badge!`,
              link: "/badges",
            },
          });
          newlyEarned.push("completionist-supreme");
        }
      } catch {
        // Non-critical
      }
    }

    return newlyEarned;
  } catch {
    return [];
  }
}

/**
 * Check ALL badges for a user (used by backfill script).
 * Does NOT send notifications.
 */
export async function checkAllBadges(userId: string): Promise<string[]> {
  try {
    const existing = await prisma.userBadge.findMany({
      where: { userId },
      select: { slug: true },
    });
    const earnedSet = new Set(existing.map((e) => e.slug));
    const newlyEarned: string[] = [];

    for (const def of BADGE_REGISTRY) {
      if (def.slug === "completionist-supreme") continue; // check last
      if (earnedSet.has(def.slug)) continue;
      try {
        const earned = await def.check(userId);
        if (earned) {
          await prisma.userBadge.create({ data: { userId, slug: def.slug } });
          newlyEarned.push(def.slug);
        }
      } catch {
        // skip
      }
    }

    // Check completionist supreme last
    if (!earnedSet.has("completionist-supreme") && newlyEarned.length > 0) {
      const total = earnedSet.size + newlyEarned.length;
      if (total >= 40) {
        await prisma.userBadge.create({ data: { userId, slug: "completionist-supreme" } });
        newlyEarned.push("completionist-supreme");
      }
    }

    return newlyEarned;
  } catch {
    return [];
  }
}

