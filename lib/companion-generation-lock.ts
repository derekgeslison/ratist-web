import { prisma } from "@/lib/prisma";

// How long a lock can be held before another acquirer is allowed to
// overwrite it. A normal generation takes 2-4 minutes; 15 minutes gives
// generous headroom (slow Anthropic responses, large seasons) while
// still recovering from a crashed gen within the same workday.
const STALE_LOCK_MS = 15 * 60 * 1000;

// Movies don't have seasons; we use 0 as a sentinel so the unique
// constraint on (tmdbId, mediaType, season) treats movies as a single
// lockable target. NULL would let multiple rows through under Postgres'
// "each null is distinct" rule.
function seasonKey(season: number | null | undefined): number {
  return typeof season === "number" && season > 0 ? season : 0;
}

export type LockResult =
  | { acquired: true; lockId: string }
  | { acquired: false; heldBy: string | null; secondsRemaining: number };

/**
 * Try to acquire the generation lock for (tmdbId, mediaType, season).
 * Idempotent against stale locks — if the existing lock is older than
 * STALE_LOCK_MS, we delete-and-recreate (the previous gen presumably
 * crashed). The recreate path issues a NEW row id, so a slow predecessor
 * that finishes after being stolen can't release the successor's lock —
 * its release call will match no rows.
 */
export async function acquireGenerationLock(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season: number | null,
  acquiredBy: string | null,
): Promise<LockResult> {
  const seasonInt = seasonKey(season);

  // Fast path: try to insert. Wins iff no existing lock — Postgres' unique
  // constraint serializes the race when two callers try simultaneously.
  try {
    const lock = await prisma.companionGenerationLock.create({
      data: { tmdbId, mediaType, season: seasonInt, acquiredBy },
    });
    return { acquired: true, lockId: lock.id };
  } catch {
    // Fall through — likely unique constraint violation. Check the
    // existing lock's age and either steal it (stale) or refuse (fresh).
  }

  const existing = await prisma.companionGenerationLock.findUnique({
    where: { tmdbId_mediaType_season: { tmdbId, mediaType, season: seasonInt } },
  });
  if (!existing) {
    // Race: existed at create time, gone by find time. Retry once.
    try {
      const lock = await prisma.companionGenerationLock.create({
        data: { tmdbId, mediaType, season: seasonInt, acquiredBy },
      });
      return { acquired: true, lockId: lock.id };
    } catch {
      return { acquired: false, heldBy: null, secondsRemaining: 0 };
    }
  }

  const ageMs = Date.now() - existing.acquiredAt.getTime();
  if (ageMs >= STALE_LOCK_MS) {
    // Stale takeover: delete + recreate inside a transaction so the new
    // row has its own id (defeats stale-predecessor accidental releases)
    // and we don't blast another concurrent acquirer who's mid-takeover.
    try {
      const newLock = await prisma.$transaction(async (tx) => {
        const fresh = await tx.companionGenerationLock.findUnique({
          where: { id: existing.id },
        });
        if (!fresh || Date.now() - fresh.acquiredAt.getTime() < STALE_LOCK_MS) {
          throw new Error("lock no longer stale");
        }
        await tx.companionGenerationLock.delete({ where: { id: existing.id } });
        return tx.companionGenerationLock.create({
          data: { tmdbId, mediaType, season: seasonInt, acquiredBy },
        });
      });
      return { acquired: true, lockId: newLock.id };
    } catch {
      // Either the lock got refreshed or another racer stole it first.
      return {
        acquired: false,
        heldBy: existing.acquiredBy,
        secondsRemaining: 0,
      };
    }
  }

  return {
    acquired: false,
    heldBy: existing.acquiredBy,
    secondsRemaining: Math.max(0, Math.ceil((STALE_LOCK_MS - ageMs) / 1000)),
  };
}

/**
 * Release the generation lock by its id. Idempotent — releasing a lock
 * that's already gone (because a stale-takeover replaced it with a new
 * row id) is a no-op. Always pair with the lockId returned from a
 * successful acquireGenerationLock call.
 */
export async function releaseGenerationLock(lockId: string): Promise<void> {
  await prisma.companionGenerationLock.deleteMany({ where: { id: lockId } });
}
