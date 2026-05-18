import { prisma } from "@/lib/prisma";
import { checkBadges } from "@/lib/badges";
import { SCREENING_MAX_DURATION_MS, POST_WATCH_MAX_DURATION_MS } from "@/lib/screening";

/**
 * Auto-flip a screening session to COMPLETE if either time limit
 * has elapsed. Called from the session GET handler, the rate POST,
 * and the PATCH handler — anywhere that touches an active session.
 *
 * Two triggers:
 *   - 4-hour wall-clock cap since startedAt (any active state).
 *     Prevents forgotten rooms from leaving participants stuck in
 *     the "you already have an active room" gate forever.
 *   - 25-minute post-watch cap since finishedAt (POST_WATCH only).
 *     Stops one flaky participant from blocking everyone else from
 *     starting a new session by never submitting their review.
 *
 * Returns whether a flip happened and the reason — callers don't
 * need to use it, but tests / observability surfaces might.
 */

type SessionSnapshot = {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export interface AutoCompleteResult {
  flipped: boolean;
  reason: "duration" | "post_watch" | null;
}

export async function autoCompleteIfExpired(session: SessionSnapshot): Promise<AutoCompleteResult> {
  if (session.status === "COMPLETE") return { flipped: false, reason: null };
  const now = Date.now();

  // 4-hour wall-clock cap. Only applies once startedAt has been set
  // (i.e. the session has actually gone past LOBBY/COUNTDOWN).
  if (session.startedAt) {
    const elapsed = now - new Date(session.startedAt).getTime();
    if (elapsed >= SCREENING_MAX_DURATION_MS) {
      await markComplete(session.id, session.finishedAt);
      return { flipped: true, reason: "duration" };
    }
  }

  // 25-minute post-watch cap. Only fires when actually in POST_WATCH.
  if (session.status === "POST_WATCH" && session.finishedAt) {
    const elapsed = now - new Date(session.finishedAt).getTime();
    if (elapsed >= POST_WATCH_MAX_DURATION_MS) {
      await markComplete(session.id, session.finishedAt);
      return { flipped: true, reason: "post_watch" };
    }
  }

  return { flipped: false, reason: null };
}

/** Shared inner update + badge fan-out so both timeout branches
 *  fire the same side effects as the manual COMPLETE path. */
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
