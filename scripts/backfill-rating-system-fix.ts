/**
 * Two-step backfill for the rating-system fix:
 *
 *   1) Movie imports created before /api/import set reviewType="basic"
 *      explicitly inherited the schema default "standard". Update those
 *      to "basic". Scoped to rows where importSource IS NOT NULL AND
 *      plot IS NULL — i.e. rows still in their original imported state
 *      (the rate endpoint clears importSource on submit, so a non-null
 *      importSource means the user has NOT taken ownership). This is
 *      paranoid; even without the plot check, the importSource gate
 *      alone is safe, but the extra guard makes it impossible to
 *      reclassify a partially-filled upgrade.
 *
 *   2) Run rebuildUserProfile for every user so the new genre logic
 *      (derived from movie/show TMDB genres × user's overall rating)
 *      and threshold (8 → 7.5) take effect on every existing profile.
 *      Includes TV ratings now where it didn't before. Without this,
 *      profiles stay at their pre-fix snapshot until each user's next
 *      rating action triggers a rebuild.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: npx tsx scripts/backfill-rating-system-fix.ts [--dry-run]
 *      npx tsx scripts/backfill-rating-system-fix.ts --user "Derek Geslison"
 *      npx tsx scripts/backfill-rating-system-fix.ts --skip-imports
 *      npx tsx scripts/backfill-rating-system-fix.ts --skip-rebuild
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipImports = args.includes("--skip-imports");
const skipRebuild = args.includes("--skip-rebuild");
const userFlagIdx = args.indexOf("--user");
const onlyUserName = userFlagIdx >= 0 ? args[userFlagIdx + 1] : null;

async function fixImportReviewType() {
  console.log("\n=== Step 1: Re-tag movie imports as 'basic' ===");
  const affected = await prisma.movieRating.count({
    where: {
      importSource: { not: null },
      plot: null,
      reviewType: "standard",
    },
  });
  console.log(`Found ${affected} movie imports still tagged reviewType="standard" (should be "basic").`);
  if (dryRun) { console.log("(--dry-run; skipping update)"); return; }
  if (affected === 0) { console.log("Nothing to do."); return; }

  const result = await prisma.movieRating.updateMany({
    where: {
      importSource: { not: null },
      plot: null,
      reviewType: "standard",
    },
    data: { reviewType: "basic" },
  });
  console.log(`Updated ${result.count} rows.`);
}

async function rebuildAllProfiles() {
  console.log("\n=== Step 2: Rebuild user profiles ===");
  // Dynamic import so the env from dotenv is already loaded by the time
  // lib/prisma initializes inside lib/profile's transitive imports.
  const { rebuildUserProfile } = await import("../lib/profile");

  const where = onlyUserName ? { name: onlyUserName } : {};
  const users = await prisma.user.findMany({
    where: { ...where, deletedAt: null },
    select: { id: true, name: true, _count: { select: { ratings: true, tvShowRatings: true } } },
  });
  console.log(`Found ${users.length} user(s) to rebuild.${onlyUserName ? ` (filtered to "${onlyUserName}")` : ""}`);

  if (dryRun) { console.log("(--dry-run; skipping rebuild)"); return; }

  let done = 0;
  let failed = 0;
  for (const u of users) {
    try {
      await rebuildUserProfile(u.id);
      done++;
      if (done % 25 === 0 || done === users.length) {
        console.log(`  ${done}/${users.length} (${u.name}: ${u._count.ratings} movies + ${u._count.tvShowRatings} TV)`);
      }
    } catch (err) {
      failed++;
      console.error(`  FAIL ${u.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nRebuilt ${done}/${users.length} profiles. ${failed} failed.`);
}

async function main() {
  console.log("Mode:", { dryRun, skipImports, skipRebuild, onlyUserName });
  if (!skipImports) await fixImportReviewType();
  if (!skipRebuild) await rebuildAllProfiles();
  console.log("\nDone.");
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
