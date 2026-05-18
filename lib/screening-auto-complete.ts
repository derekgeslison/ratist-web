import { prisma } from "@/lib/prisma";
import { checkBadges } from "@/lib/badges";
import { adminDatabase } from "@/lib/firebase-admin";
import {
  SCREENING_MAX_DURATION_MS,
  POST_WATCH_MAX_DURATION_MS,
  LOBBY_MAX_DURATION_MS,
  rtdbPaths,
} from "@/lib/screening";

/**
 * Auto-transition a screening session if a time limit has elapsed.
 * Called from the session GET handler, the rate POST, and the PATCH
 * handler — anywhere that touches a session.
 *
 * Three triggers:
 *   - 1-hour lobby cap since createdAt (LOBBY only). The session is
 *     DELETED entirely — there's nothing to preserve in a lobby that
 *     never started, and leaving it around would also block the host
 *     from creating a new room via the no-concurrent gate.
 *   - 4-hour watching cap since startedAt. Force-transitions WATCHING
 *     to POST_WATCH so users still get the full 25-min review window
 *     after the cap fires (max total session time = 4h 25m). On any
 *     other active status it's a no-op — POST_WATCH has its own cap,
 *     and LOBBY/COUNTDOWN haven't actually started watching yet.
 *   - 25-minute post-watch cap since finishedAt (POST_WATCH only).
 *     Stops one flaky participant from blocking everyone else from
 *     starting a new session by never submitting their review.
 *
 * The deleted-lobby result is signalled with a separate flag so
 * callers can return a tailored "this room expired" response instead
 * of trying to read a session that no longer exists.
 */

type SessionSnapshot = {
  id: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export interface AutoCompleteResult {
  flipped: boolean;
  /** Only true for the lobby-timeout branch — the session row is gone. */
  deleted: boolean;
  reason: "lobby" | "duration" | "post_watch" | null;
}

export async function autoCompleteIfExpired(session: SessionSnapshot): Promise<AutoCompleteResult> {
  if (session.status === "COMPLETE") return { flipped: false, deleted: false, reason: null };
  const now = Date.now();

  // 1-hour lobby cap. Lobby never reaches WATCHING → no data worth
  // preserving → just delete the row + RTDB state outright.
  if (session.status === "LOBBY") {
    const elapsed = now - new Date(session.createdAt).getTime();
    if (elapsed >= LOBBY_MAX_DURATION_MS) {
      await deleteAbandonedLobby(session.id);
      return { flipped: true, deleted: true, reason: "lobby" };
    }
    return { flipped: false, deleted: false, reason: null };
  }

  // 4-hour watching cap. Force-transition to POST_WATCH instead of
  // flipping straight to COMPLETE so users get the full review window.
  // Limited to WATCHING — applying it to POST_WATCH would clobber the
  // 25-min post-watch cap if a movie was close to 4h long.
  if (session.status === "WATCHING" && session.startedAt) {
    const elapsed = now - new Date(session.startedAt).getTime();
    if (elapsed >= SCREENING_MAX_DURATION_MS) {
      await prisma.screeningSession.update({
        where: { id: session.id },
        data: { status: "POST_WATCH", finishedAt: new Date() },
      });
      return { flipped: true, deleted: false, reason: "duration" };
    }
  }

  // 25-minute post-watch cap. Only fires when actually in POST_WATCH.
  if (session.status === "POST_WATCH" && session.finishedAt) {
    const elapsed = now - new Date(session.finishedAt).getTime();
    if (elapsed >= POST_WATCH_MAX_DURATION_MS) {
      await markComplete(session.id, session.finishedAt);
      return { flipped: true, deleted: false, reason: "post_watch" };
    }
  }

  return { flipped: false, deleted: false, reason: null };
}

/** Shared inner update + badge fan-out so the post-watch timeout
 *  fires the same side effects as the manual COMPLETE path. */
async function markComplete(sessionId: string, existingFinishedAt: Date | null): Promise<void> {
  await prisma.screeningSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETE",
      ...(existingFinishedAt ? {} : { finishedAt: new Date() }),
    },
  });
  // Same badge re-check the manual COMPLETE paths do. SQL-level
  // Screening Host / Pack Leader badge gates require status =
  // COMPLETE, so this is where they actually become awardable on
  // an auto-closed session.
  const participants = await prisma.screeningParticipant.findMany({
    where: { sessionId },
    select: { userId: true },
  });
  for (const p of participants) {
    checkBadges(p.userId, "screening_end").catch(() => {});
  }
}

/** Tear down an abandoned lobby — Prisma cascade handles participants
 *  + invites, but RTDB state is separate and has to be purged here. */
async function deleteAbandonedLobby(sessionId: string): Promise<void> {
  try {
    await prisma.screeningSession.delete({ where: { id: sessionId } });
  } catch { /* already gone — fine */ }
  try {
    await adminDatabase.ref(rtdbPaths.session(sessionId)).remove();
  } catch { /* RTDB best-effort */ }
}
