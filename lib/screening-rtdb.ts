/**
 * Server-side helpers for mirroring screening-session membership into
 * Firebase RTDB. The mirror exists so RTDB security rules can gate
 * read/write on participant status (see `database.rules.json` at repo
 * root). Without this mirror, rules can't tell who's allowed in a
 * given session and we have to fall back to ".write": "auth != null"
 * — which lets any signed-in user inject chat messages, forge pause
 * requests, or wipe data wholesale in ANY session.
 *
 * Source of truth for membership stays in Postgres (`ScreeningParticipant`
 * table). RTDB is just a denormalized read for rule-evaluation. If the
 * two ever drift, Postgres wins; resyncing means rewriting the
 * participants node from the Postgres rows.
 *
 * All write failures here are logged and swallowed — Postgres is
 * authoritative and the worst case (RTDB write fails after a join)
 * means the user shows as "not in session" to the rules and can't
 * use realtime features until the mirror retries on their next
 * mutation. That degrades the feature, not the data.
 */
import "server-only";
import { adminDatabase } from "@/lib/firebase-admin";

function participantsRef(sessionId: string) {
  return adminDatabase.ref(`screening-rooms/${sessionId}/participants`);
}

/**
 * Add a single user to the session's participants node. Idempotent —
 * setting `true` over `true` is a no-op write.
 */
export async function addParticipantToRtdb(
  sessionId: string,
  userId: string,
): Promise<void> {
  try {
    await participantsRef(sessionId).child(userId).set(true);
  } catch (err) {
    console.error("[screening-rtdb] addParticipant failed:", sessionId, userId, err);
  }
}

/**
 * Remove a user from the session's participants node. Called when a
 * user leaves voluntarily or is kicked by the host.
 */
export async function removeParticipantFromRtdb(
  sessionId: string,
  userId: string,
): Promise<void> {
  try {
    await participantsRef(sessionId).child(userId).remove();
  } catch (err) {
    console.error("[screening-rtdb] removeParticipant failed:", sessionId, userId, err);
  }
}

/**
 * Replace the entire participants node with the given userId set.
 * Useful for bootstrap / repair when the RTDB mirror has drifted
 * from Postgres reality.
 */
export async function setParticipantsInRtdb(
  sessionId: string,
  userIds: string[],
): Promise<void> {
  const payload: Record<string, true> = {};
  for (const uid of userIds) payload[uid] = true;
  try {
    await participantsRef(sessionId).set(payload);
  } catch (err) {
    console.error("[screening-rtdb] setParticipants failed:", sessionId, err);
  }
}

/**
 * Tear down the entire session's RTDB state (chat, participants,
 * everything). Called when a session is fully deleted server-side.
 */
export async function purgeSessionFromRtdb(sessionId: string): Promise<void> {
  try {
    await adminDatabase.ref(`screening-rooms/${sessionId}`).remove();
  } catch (err) {
    console.error("[screening-rtdb] purgeSession failed:", sessionId, err);
  }
}
