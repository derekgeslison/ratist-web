/**
 * Auto-scan all NC-17 movie posters via Google Cloud Vision
 * SafeSearch. Posters that come back over our explicit-content
 * threshold get posterBlocked = true; everything else has its scan
 * timestamp recorded so we don't re-scan on subsequent runs.
 *
 * Cost: ~$1.50 per 1000 images. Catalog NC-17 count is small enough
 * to scan fully each run, but the posterScannedAt skip keeps repeat
 * runs cheap.
 *
 * Run with: npx tsx scripts/scan-nc17-posters.ts
 * Auth: uses the Firebase Admin service-account credentials (same as
 * the profile-avatar upload route) — make sure the Cloud Vision API
 * is enabled on the GCP project the service account belongs to.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scanPosterSafeSearch, shouldBlockPoster } from "../lib/vision-safesearch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";

async function main() {
  const movies = await prisma.movie.findMany({
    where: {
      mpaaRating: "NC-17",
      posterPath: { not: null },
      posterScannedAt: null,
    },
    select: { id: true, tmdbId: true, title: true, posterPath: true },
  });

  console.log(`Found ${movies.length} NC-17 movies with unscanned posters`);

  let scanned = 0;
  let blocked = 0;
  let apiFailures = 0;

  for (const movie of movies) {
    if (!movie.posterPath) continue;
    const imageUrl = `${TMDB_POSTER_BASE}${movie.posterPath}`;
    const verdict = await scanPosterSafeSearch(imageUrl);

    if (!verdict) {
      apiFailures++;
      console.log(`  ⚠️  API failure for ${movie.title} (${movie.tmdbId})`);
      // Don't mark scanned — let the next run retry.
      continue;
    }

    const block = shouldBlockPoster(verdict);
    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        posterScannedAt: new Date(),
        posterScanResult: verdict as unknown as object,
        ...(block ? { posterBlocked: true } : {}),
      },
    });

    scanned++;
    if (block) {
      blocked++;
      console.log(`  🚫 BLOCKED: ${movie.title} (adult=${verdict.adult}, racy=${verdict.racy})`);
    } else if (scanned % 25 === 0) {
      console.log(`  ✓ Scanned ${scanned}/${movies.length}…`);
    }

    // Small delay to be gentle on the Vision quota; SafeSearch is
    // generous but bursty runs trigger 429s. 200ms keeps us under
    // 5 req/sec.
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. Scanned ${scanned}, blocked ${blocked}, API failures ${apiFailures}.`);
}

void main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
