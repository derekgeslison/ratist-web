/**
 * Audit current revenue/budget coverage in the Movie table.
 *
 * Drives the Stage 0 decision on whether a backfill is needed before
 * building the Box Office feature. The output is a series of buckets
 * showing coverage by popularity, release decade, and combined fields,
 * plus a sample of high-popularity movies with missing data.
 *
 * Run with:  npx tsx scripts/audit-box-office-coverage.ts
 * Env: relies on DATABASE_URL from .env. Reads only — safe.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FLOOR: bigint = BigInt(1000); // matches the placeholder-floor we apply in the UI

function pct(n: number, d: number): string {
  if (d === 0) return "0.0%";
  return ((n / d) * 100).toFixed(1) + "%";
}

async function main() {
  console.log("=== Box Office Data Coverage Audit ===\n");

  const total = await prisma.movie.count();
  console.log(`Total movies in DB: ${total.toLocaleString()}\n`);

  // ── Overall coverage ─────────────────────────────────────────────
  const ZERO: bigint = BigInt(0);
  const [withRevenueAny, withRevenueReal, withBudgetAny, withBudgetReal, withBoth] = await Promise.all([
    prisma.movie.count({ where: { revenue: { gt: ZERO } } }),
    prisma.movie.count({ where: { revenue: { gte: FLOOR } } }),
    prisma.movie.count({ where: { budget: { gt: ZERO } } }),
    prisma.movie.count({ where: { budget: { gte: FLOOR } } }),
    prisma.movie.count({ where: { revenue: { gte: FLOOR }, budget: { gte: FLOOR } } }),
  ]);
  console.log("Overall coverage:");
  console.log(`  revenue > 0:        ${withRevenueAny.toLocaleString()} (${pct(withRevenueAny, total)})`);
  console.log(`  revenue ≥ $1k:      ${withRevenueReal.toLocaleString()} (${pct(withRevenueReal, total)})`);
  console.log(`  budget > 0:         ${withBudgetAny.toLocaleString()} (${pct(withBudgetAny, total)})`);
  console.log(`  budget ≥ $1k:       ${withBudgetReal.toLocaleString()} (${pct(withBudgetReal, total)})`);
  console.log(`  both ≥ $1k:         ${withBoth.toLocaleString()} (${pct(withBoth, total)})\n`);

  // ── Coverage by popularity decile ────────────────────────────────
  // Approximation via popularity thresholds rather than true deciles —
  // a true decile would require ranking the entire table. These cuts
  // map to "blockbuster / mainstream / niche / obscure".
  const popBuckets: Array<{ label: string; min: number; max?: number }> = [
    { label: "popularity ≥ 50  (blockbuster)", min: 50 },
    { label: "popularity 20–50 (mainstream)", min: 20, max: 50 },
    { label: "popularity 5–20  (niche)",      min: 5,  max: 20 },
    { label: "popularity < 5   (obscure)",    min: 0,  max: 5 },
  ];
  console.log("Coverage by popularity bucket (revenue ≥ $1k / total):");
  for (const b of popBuckets) {
    const where = b.max != null
      ? { popularity: { gte: b.min, lt: b.max } }
      : { popularity: { gte: b.min } };
    const [bTotal, bWith] = await Promise.all([
      prisma.movie.count({ where }),
      prisma.movie.count({ where: { ...where, revenue: { gte: FLOOR } } }),
    ]);
    console.log(`  ${b.label.padEnd(35)} ${bWith.toLocaleString()}/${bTotal.toLocaleString()}  (${pct(bWith, bTotal)})`);
  }
  console.log();

  // ── Coverage by release decade ───────────────────────────────────
  const decades: Array<{ label: string; from: string; to: string }> = [
    { label: "2020s", from: "2020-01-01", to: "2030-01-01" },
    { label: "2010s", from: "2010-01-01", to: "2020-01-01" },
    { label: "2000s", from: "2000-01-01", to: "2010-01-01" },
    { label: "1990s", from: "1990-01-01", to: "2000-01-01" },
    { label: "1980s", from: "1980-01-01", to: "1990-01-01" },
    { label: "pre-1980", from: "1900-01-01", to: "1980-01-01" },
  ];
  console.log("Coverage by release decade (revenue ≥ $1k / total):");
  for (const d of decades) {
    const where = { releaseDate: { gte: d.from, lt: d.to } };
    const [bTotal, bWith] = await Promise.all([
      prisma.movie.count({ where }),
      prisma.movie.count({ where: { ...where, revenue: { gte: FLOOR } } }),
    ]);
    console.log(`  ${d.label.padEnd(10)} ${bWith.toLocaleString()}/${bTotal.toLocaleString()}  (${pct(bWith, bTotal)})`);
  }
  console.log();

  // ── Top 100 most popular movies ──────────────────────────────────
  const top100 = await prisma.movie.findMany({
    orderBy: { popularity: "desc" },
    take: 100,
    select: { tmdbId: true, title: true, popularity: true, revenue: true, budget: true, releaseDate: true },
  });
  const top100MissingRev = top100.filter((m) => !m.revenue || m.revenue < FLOOR);
  const top100MissingBud = top100.filter((m) => !m.budget || m.budget < FLOOR);
  console.log("Top 100 by popularity:");
  console.log(`  missing revenue:    ${top100MissingRev.length}`);
  console.log(`  missing budget:     ${top100MissingBud.length}`);
  if (top100MissingRev.length > 0) {
    console.log("  sample missing-revenue titles (first 10):");
    for (const m of top100MissingRev.slice(0, 10)) {
      console.log(`    - ${m.title} (${m.releaseDate ?? "—"}) tmdb=${m.tmdbId} pop=${m.popularity?.toFixed(1)}`);
    }
  }
  console.log();

  // ── Top 1000 movies ──────────────────────────────────────────────
  const top1000 = await prisma.movie.count({ where: { popularity: { not: null } } });
  // Simpler proxy: count among movies ranked by popularity, how many of
  // top 1000 are missing revenue. Doing it with a raw query for speed.
  const missingTopN = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM (
       SELECT id, revenue FROM movies WHERE popularity IS NOT NULL ORDER BY popularity DESC LIMIT 1000
     ) t WHERE revenue IS NULL OR revenue < 1000`,
  );
  console.log(`Top 1000 by popularity:`);
  console.log(`  missing revenue:    ${Number(missingTopN[0].count)}/1000`);

  // ── Recent releases (last 90 days) ───────────────────────────────
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const recent = await prisma.movie.count({
    where: { releaseDate: { gte: ninetyDaysAgo, lte: today } },
  });
  const recentWithRev = await prisma.movie.count({
    where: {
      releaseDate: { gte: ninetyDaysAgo, lte: today },
      revenue: { gte: FLOOR },
    },
  });
  console.log(`\nRecent releases (last 90d):`);
  console.log(`  total:              ${recent.toLocaleString()}`);
  console.log(`  with revenue ≥ $1k: ${recentWithRev.toLocaleString()} (${pct(recentWithRev, recent)})`);

  console.log("\n=== Done ===");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
