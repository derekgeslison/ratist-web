/**
 * Backfill Movie.originalLanguage for existing movies. Without this
 * the language filter on /box-office/all would only show entries
 * for movies whose detail page has been viewed since the schema
 * change.
 *
 * Strategy mirrors backfill-collections.ts: load every candidate
 * movie upfront, walk in revenue-desc order so a partial run still
 * produces useful filter coverage. ~20K calls × ~35ms = ~12 min.
 *
 * Run:  BASE_URL=https://theratist.com npx tsx scripts/backfill-original-language.ts
 *   or just: npx tsx scripts/backfill-original-language.ts  (uses local DB)
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

const SLEEP_MS = 35; // ~28 RPS, well under TMDB's ~50 RPS cap
const FLOOR = BigInt(1000); // mirrors the box-office leaderboard floor

interface TmdbMovieResponse {
  id: number;
  original_language?: string;
}

async function fetchLanguage(tmdbId: number): Promise<string | null> {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) return null;
  const data = (await res.json()) as TmdbMovieResponse;
  return data.original_language ?? null;
}

async function main() {
  // Same up-front fetch as backfill-collections — pagination on a
  // mutating WHERE breaks Prisma's cursor positioning.
  const candidates: Array<{ id: string; tmdbId: number; title: string }> = await prisma.movie.findMany({
    where: { revenue: { gte: FLOOR }, originalLanguage: null },
    orderBy: { revenue: "desc" },
    select: { id: true, tmdbId: true, title: true },
  });
  console.log(`Backfilling original_language for ${candidates.length.toLocaleString()} movies (rev ≥ $1k, language null).`);

  let processed = 0;
  let updated = 0;
  let missing = 0;

  for (const movie of candidates) {
    try {
      const lang = await fetchLanguage(movie.tmdbId);
      if (lang) {
        await prisma.movie.update({
          where: { id: movie.id },
          data: { originalLanguage: lang },
        });
        updated++;
      } else {
        // Almost every TMDB movie has original_language set, so this
        // branch is rare — typically API errors that returned ok=false
        // (already filtered) or genuinely missing data. We don't
        // sentinel these because the frequency is low enough that
        // re-checking them on a future run is cheap.
        missing++;
      }
    } catch (err) {
      console.warn(`  failed for ${movie.title} (tmdb=${movie.tmdbId}):`, err instanceof Error ? err.message : err);
    }
    processed++;
    if (processed % 100 === 0) {
      console.log(`  ${processed}/${candidates.length} (${updated} populated, ${missing} missing)`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`\n=== Done ===`);
  console.log(`processed: ${processed}`);
  console.log(`populated: ${updated}`);
  console.log(`missing:   ${missing}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
