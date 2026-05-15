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
 * NOTE: This script deliberately does NOT import `lib/screening-rtdb.ts`
 * because that module ships with `import "server-only"` (which throws
 * at module load outside Next.js's bundler). Inline-init firebase-admin
 * and write directly to the participants ref instead — behavior must
 * stay identical to addParticipantToRtdb() in screening-rtdb.ts.
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const { prisma } = await import("../lib/prisma");

  // Inline firebase-admin init to avoid pulling in screening-rtdb.ts
  // (which has `import "server-only"` and breaks tsx).
  const adminApp = await import("firebase-admin/app");
  const adminDb = await import("firebase-admin/database");
  if (adminApp.getApps().length === 0) {
    adminApp.initializeApp({
      credential: adminApp.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
  }
  const database = adminDb.getDatabase();

  console.log("[backfill] reading screening participants from Postgres...");
  // Join through User to get firebaseUid — the RTDB rules check
  // auth.uid (Firebase UID), not the Postgres User.id (cuid).
  const rows = await prisma.screeningParticipant.findMany({
    select: {
      sessionId: true,
      user: { select: { firebaseUid: true } },
    },
  });
  console.log(`[backfill] found ${rows.length} participant rows`);

  let done = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const firebaseUid = row.user?.firebaseUid;
    if (!firebaseUid) { skipped++; continue; }
    try {
      await database
        .ref(`screening-rooms/${row.sessionId}/participants/${firebaseUid}`)
        .set(true);
      done++;
    } catch (err) {
      console.error("[backfill] write failed:", row.sessionId, firebaseUid, err);
      failed++;
    }
    if ((done + skipped + failed) % 50 === 0) {
      console.log(`[backfill] progress ${done + skipped + failed}/${rows.length}...`);
    }
  }
  console.log(`[backfill] done — mirrored ${done}, skipped ${skipped}, failed ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
