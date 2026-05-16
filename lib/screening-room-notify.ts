/**
 * Server-side FCM/Web-Push fan-out for Screening Room activity.
 *
 * Called from /api/screening/[id]/notify-event after the sender's
 * client writes a chat message / opens a poll / fires a pause
 * request to RTDB. Each participant in the room is evaluated:
 *
 *   - Skip the sender (they obviously know about their own event).
 *   - Skip anyone whose presence heartbeat is fresh
 *     (within PRESENCE_STALE_MS) — they're actively in the room
 *     and already heard the in-page ding.
 *   - For "chat" events: skip recipients whose in-room mute flag is
 *     set, then check the per-recipient 30s throttle so a chatty
 *     stretch doesn't spam their phone.
 *   - For "poll" + "pause" events: bypass the mute flag and the
 *     throttle (existing in-room rule — those events always ping).
 *
 * For each survivor, sendPushToUser is called with the
 * "screeningRoom" push category. Users who've disabled
 * pushPrefs.screeningRoom globally won't get the push (the category
 * check inside sendPushToUser handles that). Fire-and-forget; logs
 * but never throws so a failed push doesn't break the chat write.
 */

import { prisma } from "@/lib/prisma";
import { adminDatabase } from "@/lib/firebase-admin";
import { sendPushToUser } from "@/lib/push";
import {
  rtdbPaths,
  PRESENCE_STALE_MS,
  CHAT_PUSH_THROTTLE_MS,
} from "@/lib/screening";

export type ScreeningEventKind = "chat" | "poll" | "pause";

export interface ScreeningEventInput {
  sessionId: string;
  kind: ScreeningEventKind;
  /** Sender's internal user id. Excluded from fan-out. */
  senderId: string;
  /** Sender's display name — shown in the notification title. */
  senderName: string;
  /** Message body to surface in the push. */
  message: string;
}

interface PresenceRecord {
  lastSeenAt?: number;
  muted?: boolean;
}

async function readPresence(
  sessionId: string,
  userId: string,
): Promise<PresenceRecord | null> {
  try {
    const snap = await adminDatabase
      .ref(rtdbPaths.userPresence(sessionId, userId))
      .once("value");
    const val = snap.val();
    if (val && typeof val === "object") {
      return val as PresenceRecord;
    }
    return null;
  } catch {
    // RTDB read failures shouldn't block the push. Treat the user as
    // absent (no presence record) so they get pinged anyway.
    return null;
  }
}

async function readLastChatPushAt(
  sessionId: string,
  userId: string,
): Promise<number> {
  try {
    const snap = await adminDatabase
      .ref(rtdbPaths.userLastChatPushAt(sessionId, userId))
      .once("value");
    const val = snap.val();
    return typeof val === "number" ? val : 0;
  } catch {
    return 0;
  }
}

async function stampLastChatPushAt(sessionId: string, userId: string): Promise<void> {
  try {
    await adminDatabase
      .ref(rtdbPaths.userLastChatPushAt(sessionId, userId))
      .set(Date.now());
  } catch {
    // Non-critical — losing the timestamp just means the next push
    // for this recipient won't be throttled. Better that than
    // failing the whole fan-out.
  }
}

export async function notifyScreeningEvent(input: ScreeningEventInput): Promise<void> {
  try {
    const session = await prisma.screeningSession.findUnique({
      where: { id: input.sessionId },
      select: {
        hostId: true,
        movieTitle: true,
        participants: { select: { userId: true } },
      },
    });
    if (!session) return;

    // Members = host + participants. The host can be a participant too;
    // dedupe via Set so a host who joins their own room isn't double-
    // pushed.
    const memberIds = new Set<string>([session.hostId, ...session.participants.map((p) => p.userId)]);
    memberIds.delete(input.senderId);
    if (memberIds.size === 0) return;

    const now = Date.now();
    const eventUrl = `/screening-room/${input.sessionId}`;

    // Iterate sequentially so RTDB writes for the throttle stamps
    // don't all race at once. Each recipient is ~2 small RTDB reads
    // + 1 push send, so even a 10-person room is well under 5s.
    for (const userId of memberIds) {
      const presence = await readPresence(input.sessionId, userId);
      const lastSeenAt = presence?.lastSeenAt ?? 0;
      const isPresent = now - lastSeenAt < PRESENCE_STALE_MS;
      if (isPresent) continue;

      if (input.kind === "chat") {
        if (presence?.muted) continue;
        const lastPushAt = await readLastChatPushAt(input.sessionId, userId);
        if (now - lastPushAt < CHAT_PUSH_THROTTLE_MS) continue;
        await stampLastChatPushAt(input.sessionId, userId);
      }
      // poll + pause skip both gates intentionally (matches in-room
      // ding behavior — those always fire).

      const title = input.kind === "chat"
        ? (session.movieTitle ?? "Screening Room")
        : input.kind === "poll"
          ? `New poll · ${session.movieTitle ?? "Screening Room"}`
          : `Pause requested · ${session.movieTitle ?? "Screening Room"}`;
      const body = input.kind === "chat"
        ? `${input.senderName}: ${input.message}`
        : input.message;

      sendPushToUser(
        userId,
        {
          title,
          body,
          url: eventUrl,
          tag: `screening:${input.sessionId}:${input.kind}`,
          data: { screeningId: input.sessionId, kind: input.kind },
        },
        { category: "screeningRoom" },
      ).catch((err) => {
        console.error("[screening-notify] sendPushToUser rejected:", err);
      });
    }
  } catch (err) {
    console.error("[screening-notify] fan-out failed:", err);
  }
}
