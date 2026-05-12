/**
 * Re-evaluate stored Vision SafeSearch verdicts against the current
 * shouldBlockPoster() threshold. Free — no Vision API calls. Walks
 * every Movie row that was scanned but not blocked, runs the verdict
 * through the live threshold, and flips posterBlocked when it now
 * trips the rule. Useful after threshold tightening (e.g., we
 * loosened from adult>=LIKELY to adult>=POSSIBLE).
 *
 * Run with: npx tsx scripts/reevaluate-nc17-verdicts.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { shouldBlockPoster, type SafeSearchVerdict } from "../lib/vision-safesearch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.movie.findMany({
    where: {
      posterBlocked: false,
      posterScanResult: { not: null as never },
      posterScannedAt: { not: null },
    },
    select: { id: true, tmdbId: true, title: true, mpaaRating: true, posterScanResult: true },
  });
  console.log(`Re-evaluating ${rows.length} stored verdicts…`);

  let newBlocks = 0;
  let skipped = 0;

  for (const row of rows) {
    const verdict = row.posterScanResult as unknown as SafeSearchVerdict;
    if (!verdict || typeof verdict !== "object") { skipped++; continue; }
    if (shouldBlockPoster(verdict)) {
      await prisma.movie.update({
        where: { id: row.id },
        data: { posterBlocked: true },
      });
      newBlocks++;
      if (newBlocks % 100 === 0) console.log(`  +${newBlocks} blocked so far (last: "${row.title}" — adult=${verdict.adult}, racy=${verdict.racy})`);
    }
  }

  console.log(`\nDone. ${newBlocks} newly blocked, ${skipped} skipped (malformed verdict).`);
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
