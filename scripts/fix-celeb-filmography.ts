/**
 * Targeted adult-flag fix for a single celebrity's filmography.
 * Runs in ~30 seconds for a 200-credit actress. Use when one
 * problematic celebrity page needs to be cleaned up immediately
 * without waiting on the full catalog sweep.
 *
 * Run with: npx tsx scripts/fix-celeb-filmography.ts <personTmdbId>
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
    console.error("Usage: npx tsx scripts/fix-celeb-filmography.ts <personTmdbId>");
    process.exit(1);
  }
  if (!TMDB_API_KEY) { console.error("TMDB_API_KEY missing"); process.exit(1); }

  const res = await fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_API_KEY}&append_to_response=movie_credits&include_adult=true`);
  if (!res.ok) { console.error(`TMDB returned ${res.status}`); process.exit(1); }
  const data = await res.json() as {
    name?: string;
    movie_credits?: { cast?: Array<{ id: number; adult?: boolean }>; crew?: Array<{ id: number; adult?: boolean }> };
  };

  // Pull (tmdbId, adult) from both cast + crew, dedup by tmdbId
  const credits = new Map<number, boolean>();
  for (const m of data.movie_credits?.cast ?? []) credits.set(m.id, !!m.adult);
  for (const m of data.movie_credits?.crew ?? []) credits.set(m.id, credits.get(m.id) || !!m.adult);

  const adultIds = [...credits.entries()].filter(([, isAdult]) => isAdult).map(([id]) => id);
  console.log(`${data.name}: ${credits.size} credits, ${adultIds.length} TMDB-adult.`);

  if (adultIds.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const result = await prisma.movie.updateMany({
    where: { tmdbId: { in: adultIds }, isAdult: false },
    data: { isAdult: true, posterBlocked: true },
  });
  console.log(`Updated ${result.count} rows: isAdult + posterBlocked → true.`);
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
