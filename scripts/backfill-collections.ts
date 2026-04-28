/**
 * Backfill Movie.tmdbCollectionId / tmdbCollectionName for existing
 * movies. The on-detail-page sync writes these for any movie a user
 * visits going forward, but pre-existing rows have nothing — without
 * this script the /box-office/franchises page would only surface
 * franchises whose entries had been viewed since the schema change.
 *
 * Strategy: walk movies ordered by revenue DESC (the cohort that
 * matters most for the franchise leaderboard), skipping movies where
 * tmdbCollectionId is already set. TMDB's /movie/{id} response carries
 * `belongs_to_collection` directly, so each backfill is one round-trip.
 *
 * Run:  BASE_URL=https://theratist.com npx tsx scripts/backfill-collections.ts
 *   or just: npx tsx scripts/backfill-collections.ts  (uses local DB)
 *
 * Rate limited to ~30 RPS to stay well under TMDB's ~50 RPS cap. Safe
 * to interrupt and resume — the WHERE clause naturally skips rows we
 * already filled.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
  console.error("TMDB_API_KEY missing from environment.");
  process.exit(1);
}

const BATCH = 100;            // movies per page through the cursor
const SLEEP_MS = 35;          // ~28 RPS
const FLOOR = BigInt(1000);   // only bother with movies that have real revenue

interface TmdbMovieResponse {
  id: number;
  belongs_to_collection?: { id: number; name: string } | null;
}

async function fetchCollection(tmdbId: number): Promise<{ id: number; name: string } | null> {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) return null;
  const data = (await res.json()) as TmdbMovieResponse;
  return data.belongs_to_collection ?? null;
}

async function main() {
  // Fetch the entire candidate set upfront and iterate in-memory. An
  // earlier draft used cursor pagination that re-queried the WHERE
  // clause each batch — but since the loop UPDATEs tmdbCollectionId
  // (removing rows from the WHERE result), Prisma's cursor positioning
  // returned an empty page after the first batch and the script
  // exited at 200 of ~20K movies. ~20K rows × ~80 bytes each is ~1.6MB
  // in memory, which is fine.
  const candidates = await prisma.movie.findMany({
    where: { revenue: { gte: FLOOR }, tmdbCollectionId: null },
    orderBy: { revenue: "desc" },
    select: { id: true, tmdbId: true, title: true },
  });
  console.log(`Backfilling collection metadata for ${candidates.length.toLocaleString()} movies (rev ≥ $1k, missing collection_id).`);

  let processed = 0;
  let updated = 0;
  let standalone = 0;

  for (const movie of candidates) {
    try {
      const coll = await fetchCollection(movie.tmdbId);
      if (coll) {
        await prisma.movie.update({
          where: { id: movie.id },
          data: { tmdbCollectionId: coll.id, tmdbCollectionName: coll.name },
        });
        updated++;
      } else {
        // Standalone film — leave tmdbCollectionId NULL. We don't
        // mark anything as "checked" because the on-detail-page
        // sync would overwrite a sentinel back to NULL, defeating
        // the optimization. The cost is that re-running this
        // backfill re-fetches ~12K standalone movies — acceptable
        // for a one-time-ish operation.
        standalone++;
      }
    } catch (err) {
      console.warn(`  failed for ${movie.title} (tmdb=${movie.tmdbId}):`, err instanceof Error ? err.message : err);
    }
    processed++;
    if (processed % 100 === 0) {
      console.log(`  ${processed}/${candidates.length} (${updated} franchise, ${standalone} standalone)`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`\n=== Done ===`);
  console.log(`processed:  ${processed}`);
  console.log(`franchise:  ${updated}`);
  console.log(`standalone: ${standalone}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
