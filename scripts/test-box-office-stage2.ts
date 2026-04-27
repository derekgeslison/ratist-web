/**
 * Smoke test the Stage 2 aggregation queries (genre, MPA, holiday).
 *
 * Run with: npx tsx scripts/test-box-office-stage2.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FLOOR = BigInt(1000);

function fmtRev(n: bigint | null): string {
  if (n == null) return "—";
  const num = Number(n);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  return `$${(num / 1e3).toFixed(0)}K`;
}

async function main() {
  // ── Genre: Action ────────────────────────────────────────────────
  const action = await prisma.genre.findFirst({ where: { name: "Action" } });
  if (action) {
    console.log(`=== Top Grossing Action (genre id ${action.id}) ===`);
    const rows = await prisma.movie.findMany({
      where: { genres: { some: { genreId: action.id } }, revenue: { gte: FLOOR } },
      orderBy: { revenue: "desc" },
      take: 5,
      select: { title: true, releaseDate: true, revenue: true },
    });
    rows.forEach((m) => console.log(`  ${m.title} (${m.releaseDate?.slice(0,4)}): ${fmtRev(m.revenue)}`));
  }

  // ── MPA: PG-13 ───────────────────────────────────────────────────
  console.log(`\n=== Top Grossing PG-13 ===`);
  const pg13 = await prisma.movie.findMany({
    where: { mpaaRating: "PG-13", revenue: { gte: FLOOR } },
    orderBy: { revenue: "desc" },
    take: 5,
    select: { title: true, releaseDate: true, revenue: true },
  });
  pg13.forEach((m) => console.log(`  ${m.title} (${m.releaseDate?.slice(0,4)}): ${fmtRev(m.revenue)}`));

  // ── Holiday window: Christmas (Dec 18-31) ────────────────────────
  console.log(`\n=== Top Grossing Christmas (Dec 18–31) — over-fetch test ===`);
  // Mirrors the over-fetch logic in getTopGrossingByReleaseWindow.
  const candidates = await prisma.movie.findMany({
    where: { revenue: { gte: FLOOR }, releaseDate: { not: null } },
    orderBy: { revenue: "desc" },
    take: 80,
    select: { title: true, releaseDate: true, revenue: true },
  });
  const xmas = candidates.filter((m) => {
    if (!m.releaseDate) return false;
    const [, mm, dd] = m.releaseDate.split("-");
    const md = parseInt(mm, 10) * 100 + parseInt(dd, 10);
    return md >= 1218 && md <= 1231;
  });
  console.log(`  candidates: ${candidates.length}, christmas-window matches: ${xmas.length}`);
  xmas.slice(0, 5).forEach((m) => console.log(`  ${m.title} (${m.releaseDate}): ${fmtRev(m.revenue)}`));

  // Try a wider over-fetch to see how much depth we have
  console.log(`\n=== Christmas with wider over-fetch (5000 candidates) ===`);
  const big = await prisma.movie.findMany({
    where: { revenue: { gte: FLOOR }, releaseDate: { not: null } },
    orderBy: { revenue: "desc" },
    take: 5000,
    select: { title: true, releaseDate: true, revenue: true },
  });
  const xmasBig = big.filter((m) => {
    if (!m.releaseDate) return false;
    const [, mm, dd] = m.releaseDate.split("-");
    const md = parseInt(mm, 10) * 100 + parseInt(dd, 10);
    return md >= 1218 && md <= 1231;
  });
  console.log(`  candidates: 5000, christmas-window matches: ${xmasBig.length}`);
  xmasBig.slice(0, 10).forEach((m) => console.log(`  ${m.title} (${m.releaseDate}): ${fmtRev(m.revenue)}`));

  console.log("\n=== Done ===");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
