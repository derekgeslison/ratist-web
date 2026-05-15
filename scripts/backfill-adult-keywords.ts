/**
 * Backfill adult-content flags via TMDB keyword evaluation.
 *
 * Modes:
 *   --seed-examples   Force-flag the 4 known examples (1087040, 258216,
 *                     1075175, 440249) plus any extra ids passed via
 *                     --ids 1,2,3. Useful to immediately patch over
 *                     specific tmdbIds the auto-detect misses, no
 *                     keyword fetch needed.
 *   --cached          Sweep every Movie row whose
 *                     adultKeywordsCheckedAt is null, fetching
 *                     keywords + flagging matches. This is the
 *                     long-running mode for the catalog backfill.
 *   --dry-run         Print what we'd do without writing.
 *
 * Examples:
 *   npx tsx scripts/backfill-adult-keywords.ts --seed-examples
 *   npx tsx scripts/backfill-adult-keywords.ts --cached
 *   npx tsx scripts/backfill-adult-keywords.ts --seed-examples --ids 12345,67890
 *
 * Run rate: ~10 keyword fetches/sec with concurrency=10. A full sweep
 * of ~10k cached movies takes ~17 minutes; full catalog (~500k) would
 * be ~14 hours. We narrow the catalog sweep to existing Movie rows so
 * we're never scanning fresh TMDB ids — those get caught lazily by
 * the popular-rail safeguard on first encounter.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchAndFlagAdultKeywords } from "../lib/adult-detection";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// The four examples the user surfaced — confirmed pornographic /
// softcore / erotic titles that TMDB never marked adult: true. Used
// as the seed so the immediate problem disappears before the catalog
// sweep finishes.
const KNOWN_EXAMPLES = [1087040, 258216, 1075175, 440249];

function parseArgs(): { seedExamples: boolean; cached: boolean; dryRun: boolean; extraIds: number[] } {
  const args = process.argv.slice(2);
  const out = { seedExamples: false, cached: false, dryRun: false, extraIds: [] as number[] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--seed-examples") out.seedExamples = true;
    else if (a === "--cached") out.cached = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--ids") {
      const v = args[++i];
      if (v) out.extraIds = v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    }
  }
  return out;
}

async function seedExamples(ids: number[], dryRun: boolean): Promise<void> {
  console.log(`Seeding ${ids.length} known-adult tmdbIds…`);
  for (const tmdbId of ids) {
    if (dryRun) {
      console.log(`  [dry-run] would set isAdult=true on tmdbId ${tmdbId}`);
      continue;
    }
    try {
      await prisma.movie.upsert({
        where: { tmdbId },
        create: {
          tmdbId,
          title: "",
          isAdult: true,
          posterBlocked: true,
          mediaBlocked: true,
          adultKeywordsCheckedAt: new Date(),
        },
        update: {
          isAdult: true,
          posterBlocked: true,
          mediaBlocked: true,
          adultKeywordsCheckedAt: new Date(),
        },
      });
      console.log(`  ✓ flagged tmdbId ${tmdbId}`);
    } catch (err) {
      console.error(`  ✗ failed tmdbId ${tmdbId}:`, err);
    }
  }
}

async function sweepCached(dryRun: boolean): Promise<void> {
  const rows = await prisma.movie.findMany({
    where: {
      adultKeywordsCheckedAt: null,
      isAdult: false,
    },
    select: { id: true, tmdbId: true, title: true },
    orderBy: { popularity: "desc" },
  });
  console.log(`Sweeping ${rows.length} unchecked Movie rows…`);

  let checked = 0;
  let flagged = 0;
  for (const m of rows) {
    if (dryRun) {
      console.log(`  [dry-run] would check tmdbId ${m.tmdbId} (${m.title})`);
      continue;
    }
    try {
      const isAdult = await fetchAndFlagAdultKeywords(m.tmdbId);
      checked++;
      if (isAdult) {
        flagged++;
        console.log(`  + adult: tmdbId ${m.tmdbId} "${m.title}"`);
      }
      if (checked % 500 === 0) {
        console.log(`  … checked ${checked}/${rows.length} (flagged so far: ${flagged})`);
      }
    } catch (err) {
      console.error(`  ✗ failed tmdbId ${m.tmdbId}:`, err);
    }
    // Light pacing — TMDB rate limit is 40 req / 10s. With our
    // concurrent helper inside fetchAndFlagAdultKeywords this loop
    // is mostly waiting on the network; 100ms keeps the budget safe.
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`Done. Checked ${checked}, newly flagged ${flagged}.`);
}

async function main(): Promise<void> {
  const { seedExamples: seed, cached, dryRun, extraIds } = parseArgs();
  if (!seed && !cached) {
    console.error("Usage: --seed-examples and/or --cached. See file header.");
    process.exit(1);
  }
  if (seed) {
    const ids = Array.from(new Set([...KNOWN_EXAMPLES, ...extraIds]));
    await seedExamples(ids, dryRun);
  }
  if (cached) {
    await sweepCached(dryRun);
  }
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
