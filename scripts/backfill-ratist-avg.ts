// One-time backfill for Movie.ratistAvg / TVShow.ratistAvg after the
// migration that introduced those columns (20260520000001_add_ratist_avg).
//
// Run: npx tsx scripts/backfill-ratist-avg.ts
//
// Strategy: groupBy all MovieRating rows with ratistRating != null +
// excluded: false, then one updateMany per movie. Same for TVShow,
// scoped to ratingScope: "series" so per-season ratings stay out of
// the show's series-level community avg.

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires the adapter pattern — same as the other backfill scripts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function backfillMovies() {
  console.log("Aggregating movie ratings...");
  const groups = await prisma.movieRating.groupBy({
    by: ["movieId"],
    where: { ratistRating: { not: null }, excluded: false },
    _avg: { ratistRating: true },
    _count: { ratistRating: true },
  });
  console.log(`  ${groups.length} movies with rated rows`);

  let updated = 0;
  for (const g of groups) {
    if (g._avg.ratistRating == null) continue;
    await prisma.movie.update({
      where: { id: g.movieId },
      data: {
        ratistAvg: g._avg.ratistRating,
        ratistCount: g._count.ratistRating,
      },
    });
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated}/${groups.length}`);
  }
  console.log(`  Movies done: ${updated}`);
}

async function backfillTvShows() {
  console.log("Aggregating TV show ratings (series scope only)...");
  const groups = await prisma.tVShowRating.groupBy({
    by: ["tvShowId"],
    where: { ratistRating: { not: null }, excluded: false, ratingScope: "series" },
    _avg: { ratistRating: true },
    _count: { ratistRating: true },
  });
  console.log(`  ${groups.length} shows with rated rows`);

  let updated = 0;
  for (const g of groups) {
    if (g._avg.ratistRating == null) continue;
    await prisma.tVShow.update({
      where: { id: g.tvShowId },
      data: {
        ratistAvg: g._avg.ratistRating,
        ratistCount: g._count.ratistRating,
      },
    });
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated}/${groups.length}`);
  }
  console.log(`  Shows done: ${updated}`);
}

async function main() {
  await backfillMovies();
  await backfillTvShows();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
