/**
 * Diagnostic for the adult-hide-on-filmography case. Pulls a TMDB
 * person's full credits, cross-references with our Movie table, and
 * reports:
 *   - Total movie credits TMDB returns
 *   - How many are in our DB at all
 *   - How many have isAdult: true (the rows that SHOULD be hidden)
 *   - How many have isAdult: false but TMDB says adult: true
 *     (the rows we missed — would explain leakage)
 *
 * Run with: npx tsx scripts/check-celeb-filmography.ts <personTmdbId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function main() {
  const personId = Number(process.argv[2]);
  if (!Number.isFinite(personId)) {
    console.error("Usage: npx tsx scripts/check-celeb-filmography.ts <personTmdbId>");
    process.exit(1);
  }
  if (!TMDB_API_KEY) { console.error("TMDB_API_KEY missing"); process.exit(1); }

  const res = await fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_API_KEY}&append_to_response=movie_credits&include_adult=true`);
  if (!res.ok) { console.error(`TMDB returned ${res.status}`); process.exit(1); }
  const data = await res.json() as {
    name?: string;
    movie_credits?: { cast?: Array<{ id: number; title?: string; adult?: boolean }>; crew?: Array<{ id: number; title?: string; adult?: boolean }> };
  };

  const allMovieIds = new Set<number>();
  for (const m of data.movie_credits?.cast ?? []) allMovieIds.add(m.id);
  for (const m of data.movie_credits?.crew ?? []) allMovieIds.add(m.id);

  console.log(`Person: ${data.name} (${personId})`);
  console.log(`Total unique movie credits from TMDB: ${allMovieIds.size}`);

  const dbRows = await prisma.movie.findMany({
    where: { tmdbId: { in: [...allMovieIds] } },
    select: { tmdbId: true, title: true, isAdult: true, mpaaRating: true, posterBlocked: true },
  });
  console.log(`In our DB: ${dbRows.length}`);

  const dbMap = new Map(dbRows.map((r) => [r.tmdbId, r]));
  const adultInDb = dbRows.filter((r) => r.isAdult);
  const notAdultInDb = dbRows.filter((r) => !r.isAdult);
  const notInDb = [...allMovieIds].filter((id) => !dbMap.has(id));

  console.log(`  isAdult: true (should be hidden): ${adultInDb.length}`);
  console.log(`  isAdult: false (would render): ${notAdultInDb.length}`);
  console.log(`Not in our DB (would render unchanged): ${notInDb.length}`);

  // Cross-check TMDB.adult on the ones we have in DB but tagged
  // isAdult: false. These are the "we missed it" candidates.
  console.log(`\nChecking TMDB.adult for ${Math.min(notAdultInDb.length, 50)} DB rows tagged isAdult: false…`);
  let missCount = 0;
  for (const row of notAdultInDb.slice(0, 50)) {
    const credit = [...(data.movie_credits?.cast ?? []), ...(data.movie_credits?.crew ?? [])].find((c) => c.id === row.tmdbId);
    if (credit?.adult === true) {
      missCount++;
      if (missCount <= 5) {
        console.log(`  ⚠️  "${row.title}" (${row.tmdbId}) — TMDB.adult: true, DB.isAdult: false`);
      }
    }
  }
  console.log(`  Total mismatches in sample of 50: ${missCount}`);
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
