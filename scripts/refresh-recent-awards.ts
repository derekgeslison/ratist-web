/**
 * Weekly awards refresh script.
 *
 * Clears awards sync logs for recent content so the next page visit
 * fetches fresh data from Wikidata. Targets:
 *   - Movies released in the last 2 years
 *   - TV shows that are currently airing or ended in the last 2 years
 *   - Celebrities associated with those movies/shows
 *
 * Run weekly via cron: npx tsx scripts/refresh-recent-awards.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Awards Refresh Script ===\n");
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const cutoffDate = twoYearsAgo.toISOString().slice(0, 10);

  // Step 1: Find recent movies (released in last 2 years)
  const recentMovies = await prisma.movie.findMany({
    where: { releaseDate: { gte: cutoffDate } },
    select: { id: true, title: true },
  });
  console.log(`Found ${recentMovies.length} movies released since ${cutoffDate}`);

  // Step 2: Find recent/airing TV shows
  const recentShows = await prisma.tVShow.findMany({
    where: {
      OR: [
        { status: "Returning Series" },
        { lastAirDate: { gte: cutoffDate } },
        { firstAirDate: { gte: cutoffDate } },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`Found ${recentShows.length} recent/airing TV shows`);

  // Step 3: Find celebrities linked to recent movies
  const recentCelebIds = await prisma.movieCast.findMany({
    where: { movie: { releaseDate: { gte: cutoffDate } } },
    select: { celebrityId: true },
    distinct: ["celebrityId"],
  });
  console.log(`Found ${recentCelebIds.length} celebrities in recent movies`);

  // Step 4: Clear sync logs for all of these
  const movieIds = recentMovies.map((m) => m.id);
  const showIds = recentShows.map((s) => s.id);
  const celebIds = recentCelebIds.map((c) => c.celebrityId);

  const movieResult = await prisma.awardsSyncLog.deleteMany({
    where: { entityType: "movie", entityId: { in: movieIds } },
  });
  const showResult = await prisma.awardsSyncLog.deleteMany({
    where: { entityType: "tvshow", entityId: { in: showIds } },
  });
  const celebResult = await prisma.awardsSyncLog.deleteMany({
    where: { entityType: "celebrity", entityId: { in: celebIds } },
  });

  console.log(`\nCleared sync logs:`);
  console.log(`  Movies: ${movieResult.count}`);
  console.log(`  TV Shows: ${showResult.count}`);
  console.log(`  Celebrities: ${celebResult.count}`);
  console.log(`\nNext page visit for these entities will fetch fresh awards from Wikidata.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
