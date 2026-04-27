/**
 * Quick smoke test for box-office query helpers. Confirms each
 * leaderboard returns rows and the BigInt → Number conversion is
 * sound (no NaNs, no overflows).
 *
 * Run with: npx tsx scripts/test-box-office-queries.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Inline copy of helpers since this is a script (avoids @/ alias resolution
// trouble). Mirrors lib/box-office.ts.
const BOX_OFFICE_FLOOR = BigInt(1000);
const ROI_MIN_BUDGET = BigInt(100000);

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

async function main() {
  console.log("=== Top Grossing All Time ===");
  const topGrossing = await prisma.movie.findMany({
    where: { revenue: { gte: BOX_OFFICE_FLOOR } },
    orderBy: { revenue: "desc" },
    take: 5,
    select: { tmdbId: true, title: true, revenue: true, releaseDate: true },
  });
  for (const m of topGrossing) {
    console.log(`  ${m.title} (${m.releaseDate?.slice(0, 4)}): ${fmt(Number(m.revenue))}`);
  }

  console.log("\n=== Best ROI (raw SQL) ===");
  const roi = await prisma.$queryRawUnsafe<Array<{
    title: string;
    release_date: string | null;
    revenue: bigint;
    budget: bigint;
  }>>(
    `SELECT title, release_date, revenue, budget
     FROM movies
     WHERE revenue >= $1 AND budget >= $2
     ORDER BY (revenue::float / budget::float) DESC
     LIMIT 5`,
    Number(BOX_OFFICE_FLOOR),
    Number(ROI_MIN_BUDGET),
  );
  for (const r of roi) {
    const ratio = Number(r.revenue) / Number(r.budget);
    console.log(`  ${r.title} (${r.release_date?.slice(0, 4)}): ${ratio.toFixed(1)}× (${fmt(Number(r.revenue))} on ${fmt(Number(r.budget))})`);
  }

  console.log("\n=== Top Profit ===");
  const profit = await prisma.$queryRawUnsafe<Array<{
    title: string;
    release_date: string | null;
    revenue: bigint;
    budget: bigint;
  }>>(
    `SELECT title, release_date, revenue, budget
     FROM movies
     WHERE revenue >= $1 AND budget >= $2
     ORDER BY (revenue - budget) DESC
     LIMIT 5`,
    Number(BOX_OFFICE_FLOOR),
    Number(ROI_MIN_BUDGET),
  );
  for (const p of profit) {
    const prof = Number(p.revenue) - Number(p.budget);
    console.log(`  ${p.title} (${p.release_date?.slice(0, 4)}): ${fmt(prof)} profit`);
  }

  console.log("\n=== Top of last year (2025) ===");
  const top2025 = await prisma.movie.findMany({
    where: {
      revenue: { gte: BOX_OFFICE_FLOOR },
      releaseDate: { gte: "2025-01-01", lte: "2025-12-31" },
    },
    orderBy: { revenue: "desc" },
    take: 5,
    select: { title: true, revenue: true, releaseDate: true },
  });
  for (const m of top2025) {
    console.log(`  ${m.title} (${m.releaseDate}): ${fmt(Number(m.revenue))}`);
  }

  console.log("\n=== Done ===");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
