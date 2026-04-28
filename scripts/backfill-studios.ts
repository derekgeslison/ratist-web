/**
 * Backfill Studio + MovieStudio rows for existing movies. Pulls
 * production_companies from TMDB and writes the junction.
 *
 * Same pattern as backfill-collections.ts and backfill-original-language.ts:
 * load every candidate movie upfront (~20K rows fits in memory), walk
 * in revenue-desc order so a partial run still produces useful data
 * for the leaderboard.
 *
 * Run:  npx tsx scripts/backfill-studios.ts
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

const SLEEP_MS = 35;
const FLOOR = BigInt(1000);

interface TmdbMovieResponse {
  id: number;
  production_companies?: Array<{
    id: number;
    name: string;
    logo_path?: string | null;
    origin_country?: string | null;
  }>;
}

async function fetchProductionCompanies(tmdbId: number): Promise<TmdbMovieResponse["production_companies"]> {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbMovieResponse;
  return data.production_companies ?? [];
}

async function main() {
  // We walk movies that have NO junction rows yet — once a movie has
  // ANY studio linked, we assume it's been processed (a movie with
  // zero studios in TMDB is rare). Avoids re-hitting TMDB for movies
  // already covered by the on-detail-page sync.
  const candidates: Array<{ id: string; tmdbId: number; title: string }> = await prisma.movie.findMany({
    where: { revenue: { gte: FLOOR }, studios: { none: {} } },
    orderBy: { revenue: "desc" },
    select: { id: true, tmdbId: true, title: true },
  });
  console.log(`Backfilling studios for ${candidates.length.toLocaleString()} movies (rev ≥ $1k, no studio rows yet).`);

  let processed = 0;
  let withStudios = 0;
  let withoutStudios = 0;

  for (const movie of candidates) {
    try {
      const companies = await fetchProductionCompanies(movie.tmdbId);
      if (companies && companies.length > 0) {
        // Upsert each studio, then create junction rows. createMany
        // with skipDuplicates handles the (rare) case where a study
        // is listed twice on a single film.
        await Promise.all(
          companies.map((s) =>
            prisma.studio.upsert({
              where: { id: s.id },
              create: {
                id: s.id,
                name: s.name,
                logoPath: s.logo_path ?? null,
                originCountry: s.origin_country ?? null,
              },
              update: {
                name: s.name,
                logoPath: s.logo_path ?? null,
                originCountry: s.origin_country ?? null,
              },
            }),
          ),
        );
        await prisma.movieStudio.createMany({
          data: companies.map((s) => ({ movieId: movie.id, studioId: s.id })),
          skipDuplicates: true,
        });
        withStudios++;
      } else {
        // No production_companies on TMDB. Rare — typically only for
        // very obscure or unfinished entries. Leave the junction empty.
        withoutStudios++;
      }
    } catch (err) {
      console.warn(`  failed for ${movie.title} (tmdb=${movie.tmdbId}):`, err instanceof Error ? err.message : err);
    }
    processed++;
    if (processed % 100 === 0) {
      console.log(`  ${processed}/${candidates.length} (${withStudios} with studios, ${withoutStudios} without)`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`\n=== Done ===`);
  console.log(`processed:      ${processed}`);
  console.log(`with studios:   ${withStudios}`);
  console.log(`without:        ${withoutStudios}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
