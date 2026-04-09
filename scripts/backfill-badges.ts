/**
 * One-time script to backfill badges for all existing users.
 * Awards badges silently (no notifications).
 *
 * Run with: npx tsx scripts/backfill-badges.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// We can't import from @/lib/badges directly in a script context,
// so we import checkAllBadges via a dynamic require after setting up prisma.
// Instead, inline the core logic here using raw queries.

async function main() {
  console.log("Starting badge backfill...");

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  console.log(`Found ${users.length} users to process.`);

  let totalAwarded = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      // Use checkAllBadges from the badges lib
      // Since we can't easily use path aliases in scripts, we'll use a simpler approach
      const awarded = await checkAllBadgesForUser(user.id);
      if (awarded.length > 0) {
        totalAwarded += awarded.length;
        console.log(`[${i + 1}/${users.length}] ${user.name}: awarded ${awarded.length} badges (${awarded.join(", ")})`);
      } else {
        if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${users.length}] Processing...`);
      }
    } catch (err) {
      console.error(`Error processing ${user.name}:`, err);
    }
  }

  console.log(`\nDone! Awarded ${totalAwarded} total badges across ${users.length} users.`);
  await prisma.$disconnect();
}

// Simplified badge checks that can run without the full lib import
async function checkAllBadgesForUser(userId: string): Promise<string[]> {
  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { slug: true },
  });
  const earned = new Set(existing.map((e) => e.slug));
  const newlyEarned: string[] = [];

  async function award(slug: string) {
    if (earned.has(slug)) return;
    try {
      await prisma.userBadge.create({ data: { userId, slug } });
      newlyEarned.push(slug);
      earned.add(slug);
    } catch {
      // duplicate
    }
  }

  // Watching milestones
  const seenCount = await prisma.userFavoriteMovie.count({ where: { userId } });
  if (seenCount >= 25) await award("moviegoer");
  if (seenCount >= 100) await award("film-fan");
  if (seenCount >= 250) await award("cinephile");
  if (seenCount >= 500) await award("film-scholar");
  if (seenCount >= 1000) await award("living-encyclopedia");

  // Rating milestones (only standard + critic, not basic/quick)
  const ratingCount = await prisma.movieRating.count({ where: { userId, ratistRating: { not: null }, reviewType: { in: ["standard", "critic"] } } });
  if (ratingCount >= 1) await award("first-take");
  if (ratingCount >= 10) await award("critic-in-training");
  if (ratingCount >= 50) await award("seasoned-critic");
  if (ratingCount >= 100) await award("master-critic");
  if (ratingCount >= 250) await award("the-completionist");

  // Quick draw (movies + TV)
  const [quickMovies, quickTV] = await Promise.all([
    prisma.movieRating.count({ where: { userId, reviewType: "basic" } }),
    prisma.tVShowRating.count({ where: { userId, reviewType: "basic" } }),
  ]);
  if ((quickMovies + quickTV) >= 10) await award("quick-draw");

  // Diary (using UserFavoriteMovie.watchedDate as source of truth)
  const datedCount = await prisma.userFavoriteMovie.count({ where: { userId, watchedDate: { not: null } } });
  if (datedCount >= 1) await award("first-watch");
  if (datedCount >= 30) await award("diary-keeper");

  // Marathon runner
  if (datedCount >= 10) {
    const dated = await prisma.userFavoriteMovie.findMany({
      where: { userId, watchedDate: { not: null } },
      select: { watchedDate: true },
    });
    const months = new Map<string, number>();
    for (const movie of dated) {
      const d = movie.watchedDate!;
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
      months.set(key, (months.get(key) ?? 0) + 1);
    }
    for (const count of months.values()) {
      if (count >= 10) { await award("marathon-runner"); break; }
    }
  }

  // Genre explorer (movies + TV shows)
  const genreResult = await prisma.$queryRaw<{ count: bigint }[]>`
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
  if (Number(genreResult[0]?.count ?? 0) >= 15) await award("genre-explorer");

  // Decade diver
  const decadeResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT FLOOR(CAST(LEFT(m.release_date, 4) AS INTEGER) / 10)) as count
    FROM user_favorite_movies ufm
    JOIN movies m ON m.id = ufm.movie_id
    WHERE ufm.user_id = ${userId}
      AND m.release_date IS NOT NULL
      AND LENGTH(m.release_date) >= 4
  `;
  if (Number(decadeResult[0]?.count ?? 0) >= 6) await award("decade-diver");

  // Director's cut
  const dirResult = await prisma.$queryRaw<{ count: bigint }[]>`
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
  if (Number(dirResult[0]?.count ?? 0) >= 5) await award("directors-cut");

  // Screening room
  const screeningCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_participants sp
    JOIN screening_sessions ss ON ss.id = sp.session_id
    WHERE sp.user_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
  `;
  if (Number(screeningCount[0]?.count ?? 0) >= 5) await award("social-butterfly");

  const hostCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_sessions ss
    WHERE ss.host_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
  `;
  if (Number(hostCount[0]?.count ?? 0) >= 1) await award("screening-host");

  const packCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM screening_sessions ss
    WHERE ss.host_id = ${userId}
      AND ss.status = 'COMPLETE'
      AND ss.started_at IS NOT NULL
      AND ss.finished_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (ss.finished_at - ss.started_at)) >= 3600
      AND (SELECT COUNT(*) FROM screening_participants sp WHERE sp.session_id = ss.id) >= 4
  `;
  if (Number(packCount[0]?.count ?? 0) >= 1) await award("pack-leader");

  // Community features
  const llCount = await prisma.looksLike.count({ where: { creatorId: userId } });
  if (llCount >= 1) await award("spotter");

  const recastCount = await prisma.recast.count({ where: { creatorId: userId } });
  if (recastCount >= 1) await award("casting-director");

  const htCount = await prisma.hotTake.count({ where: { authorId: userId } });
  if (htCount >= 1) await award("first-flame");

  const pitchCount = await prisma.moviePitch.count({ where: { authorId: userId } });
  if (pitchCount >= 1) await award("the-pitch");

  // Contrarian
  const contrarianResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM movie_ratings mr
    JOIN movies m ON m.id = mr.movie_id
    WHERE mr.user_id = ${userId}
      AND mr.ratist_rating IS NOT NULL
      AND m.vote_average IS NOT NULL
      AND ABS(mr.ratist_rating - m.vote_average) >= 3
    LIMIT 1
  `;
  if (Number(contrarianResult[0]?.count ?? 0) >= 1) await award("contrarian");

  // Movie Club
  const clubRatingCount = await prisma.movieClubRating.count({ where: { userId } });
  if (clubRatingCount >= 10) await award("club-member");

  // Cine-Q
  const cineqTotal = await prisma.cineQAttempt.aggregate({
    where: { userId, status: "completed" },
    _sum: { rawScore: true },
  });
  if ((cineqTotal._sum.rawScore ?? 0) >= 20000) await award("valedictorian");

  // Social
  const followingCount = await prisma.userFollow.count({ where: { followerId: userId } });
  if (followingCount >= 1) await award("first-follow");

  const followerCount = await prisma.userFollow.count({ where: { followingId: userId } });
  if (followerCount >= 50) await award("influencer");

  // Watchlist
  const wlCount = await prisma.watchlistMovie.count({
    where: { watchlist: { userId, isDefault: true } },
  });
  if (wlCount >= 25) await award("the-backlog");

  // Completionist supreme (last)
  if (newlyEarned.length > 0 || earned.size >= 40) {
    const total = earned.size;
    if (total >= 40) await award("completionist-supreme");
  }

  return newlyEarned;
}

main().catch(console.error);
