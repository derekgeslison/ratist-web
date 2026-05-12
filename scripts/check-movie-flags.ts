/**
 * One-off diagnostic. Pass a TMDB movie id as an arg or set TMDB_ID
 * env var. Prints both our DB row's flags and TMDB's adult boolean
 * so we can confirm whether the hide-entirely rule should be firing.
 *
 * Run with: npx tsx scripts/check-movie-flags.ts 1278146
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function main() {
  const tmdbIdArg = process.argv[2] ?? process.env.TMDB_ID;
  const tmdbId = Number(tmdbIdArg);
  if (!Number.isFinite(tmdbId)) {
    console.error("Usage: npx tsx scripts/check-movie-flags.ts <tmdbId>");
    process.exit(1);
  }

  const dbMovie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: {
      tmdbId: true, title: true, mpaaRating: true,
      isAdult: true, posterBlocked: true, mediaBlocked: true,
      posterScannedAt: true, posterScanResult: true,
      cachedAt: true,
    },
  });
  console.log("=== Our DB row ===");
  console.log(dbMovie ? JSON.stringify(dbMovie, null, 2) : "(no row — never cached)");

  if (!TMDB_API_KEY) {
    console.log("\n(skipping TMDB check — TMDB_API_KEY not set)");
    return;
  }
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) {
    console.log(`\nTMDB returned ${res.status}`);
    return;
  }
  const tmdb = await res.json() as { title?: string; adult?: boolean };
  console.log("\n=== TMDB ===");
  console.log({ title: tmdb.title, adult: tmdb.adult });

  console.log("\n=== Expected behavior ===");
  if (tmdb.adult && !dbMovie?.isAdult) {
    console.log("⚠️  TMDB says adult: true but our row has isAdult: false.");
    console.log("    Hide-entirely rule won't fire until the retroactive");
    console.log("    backfill runs (or the row is re-upserted).");
  } else if (tmdb.adult && dbMovie?.isAdult) {
    console.log("✓ Both flags align. Hide rule should be firing.");
  } else if (!tmdb.adult) {
    console.log("ℹ️  TMDB does NOT mark this title as adult.");
  }
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
