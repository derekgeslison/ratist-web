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
  // We only fill movies that have real revenue — the franchise
  // leaderboard ignores everything else, so backfilling no-revenue
  // films would be wasted API calls. The orderBy ensures we cover
  // the highest-impact movies first, so an interrupted run still
  // produces useful franchise data.
  const totalCandidates = await prisma.movie.count({
    where: { revenue: { gte: FLOOR }, tmdbCollectionId: null },
  });
  console.log(`Backfilling collection metadata for ~${totalCandidates.toLocaleString()} movies (rev ≥ $1k, missing collection_id).`);

  let processed = 0;
  let updated = 0;
  let standalone = 0;
  let cursor: string | undefined = undefined;

  while (true) {
    const batch: Array<{ id: string; tmdbId: number; title: string }> = await prisma.movie.findMany({
      where: { revenue: { gte: FLOOR }, tmdbCollectionId: null },
      orderBy: [{ revenue: "desc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, tmdbId: true, title: true },
    });
    if (batch.length === 0) break;

    for (const movie of batch) {
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
      if (processed % 50 === 0) {
        console.log(`  processed ${processed} (${updated} franchise members, ${standalone} standalone)`);
      }
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }

    // We're paginating with a cursor on (revenue desc, id asc) so the
    // next page picks up where this one left off. But because we only
    // UPDATE rows (we don't change the cursor field, revenue), this
    // cursor is stable across iterations even though the WHERE clause
    // changes. Movies we skipped (because we updated them to a real
    // id) are excluded from subsequent pages by the WHERE.
    cursor = batch[batch.length - 1].id;
  }

  console.log(`\n=== Done ===`);
  console.log(`processed:  ${processed}`);
  console.log(`franchise:  ${updated}`);
  console.log(`standalone: ${standalone}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
