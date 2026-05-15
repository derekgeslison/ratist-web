/**
 * One-shot: mirror every existing ScreeningParticipant row in Postgres
 * into the RTDB participants node. Run once after deploying the new
 * `database.rules.json` (the rules gate read/write on participant
 * status; existing sessions don't have their participants in RTDB yet,
 * so without this backfill the rules would lock everyone out of past
 * sessions until they re-joined).
 *
 * Usage (from web/):
 *   npx tsx scripts/backfill-screening-rtdb.ts
 *
 * Reads from the same DATABASE_URL and Firebase admin creds the web
 * app uses. Idempotent — re-running is safe.
 *
 * Auth fingerprint: this script uses the firebase-admin SDK with the
 * service-account credentials in env. It bypasses RTDB rules, which
 * is exactly what we need here.
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { addParticipantToRtdb } = await import("../lib/screening-rtdb");

  console.log("[backfill] reading screening participants from Postgres...");
  const rows = await prisma.screeningParticipant.findMany({
    select: { sessionId: true, userId: true },
  });
  console.log(`[backfill] found ${rows.length} participant rows`);

  let done = 0;
  for (const row of rows) {
    await addParticipantToRtdb(row.sessionId, row.userId);
    done++;
    if (done % 50 === 0) console.log(`[backfill] mirrored ${done}/${rows.length}...`);
  }
  console.log(`[backfill] done — mirrored ${done} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
