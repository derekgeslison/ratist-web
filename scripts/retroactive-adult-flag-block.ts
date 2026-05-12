/**
 * Retroactive TMDB.adult sweep. Iterates every Movie row and checks
 * TMDB's `adult` boolean. For each title where TMDB returns
 * adult: true:
 *   - Sets Movie.isAdult = true (drives the hide-entirely policy
 *     when combined with mpaaRating === "NC-17").
 *   - Sets Movie.posterBlocked = true (so the poster is masked
 *     across surfaces even when the title isn't NC-17 / falls into
 *     the "mask, don't hide" bucket).
 *
 * Catches:
 *   - Rows cached before the upsertMovie change wired adult-flag
 *     handling (CREATE branch wrote posterBlocked but never set
 *     isAdult; UPDATE branch didn't touch either column).
 *   - Adult titles with non-NC-17 mpaaRating that the Vision
 *     backfill never scanned (NC-17-only).
 *
 * Run with: npx tsx scripts/retroactive-adult-flag-block.ts
 * Throughput: ~10 movies/sec at TMDB's rate limit.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) { console.error("TMDB_API_KEY missing"); process.exit(1); }

async function main() {
  // Heuristic-narrowed first pass: target rows most likely to be
  // adult-tagged on TMDB. Adult content clusters in:
  //   - posterBlocked: true (Vision SafeSearch or admin flagged)
  //   - mpaaRating IN (NC-17, NR, null) — porn is rarely R/PG/G
  //   - low popularity (< 5)
  // This narrows ~562k catalog rows to a few thousand candidates,
  // turning a 15-hour sweep into ~15 minutes. A full sweep over the
  // remainder can run later as a background cron without urgency.
  const candidates = await prisma.movie.findMany({
    where: {
      isAdult: false,
      OR: [
        { posterBlocked: true },
        { mpaaRating: { in: ["NC-17", "NR"] } },
        { mpaaRating: null },
        { popularity: { lt: 5 } },
      ],
    },
    select: { id: true, tmdbId: true, title: true, mpaaRating: true, posterBlocked: true },
    orderBy: { popularity: "asc" },
  });
  console.log(`Checking ${candidates.length} likely-adult candidates for TMDB.adult flag…`);

  let checked = 0;
  let adultFound = 0;
  let newBlocked = 0;
  let apiFailures = 0;

  for (const m of candidates) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/movie/${m.tmdbId}?api_key=${TMDB_API_KEY}`);
      if (!res.ok) { apiFailures++; continue; }
      const data = await res.json() as { adult?: boolean };
      checked++;

      if (data.adult === true) {
        adultFound++;
        await prisma.movie.update({
          where: { id: m.id },
          data: {
            isAdult: true,
            ...(m.posterBlocked ? {} : { posterBlocked: true }),
          },
        });
        if (!m.posterBlocked) newBlocked++;
        if (adultFound % 50 === 0) {
          console.log(`  +${adultFound} adult-flagged (last: "${m.title}", rating=${m.mpaaRating ?? "null"})`);
        }
      }
      if (checked % 1000 === 0) {
        console.log(`  ✓ Checked ${checked}/${candidates.length} (adult so far: ${adultFound})`);
      }
    } catch {
      apiFailures++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nDone. Checked ${checked}, isAdult set on ${adultFound}, newly posterBlocked ${newBlocked}, API failures ${apiFailures}.`);
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
