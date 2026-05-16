import webpush from "web-push";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";
import { getAdminApp } from "@/lib/firebase-admin";

// Push wiring. Mirrors lib/email.ts shape: prefs gate + a single
// fan-out send. Categories match the in-app notificationPrefs keys
// (settings page exposes them under "Notification Preferences").
//
// Two transports, fanned out together:
//   • Web Push (browser PWAs, desktop browsers) via VAPID/web-push
//   • Firebase Cloud Messaging (Capacitor native Android/iOS apps)
// A user with both a desktop browser install AND the native app
// gets reached on both.

// ─── Web Push (VAPID) configuration ─────────────────────────────────────────

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@theratist.com";

let webpushConfigured = false;
function configureWebPush() {
  if (webpushConfigured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  webpushConfigured = true;
  return true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type PushCategory =
  | "commentOnContent"
  | "likeOnContent"
  | "commentReplies"
  | "commentLikes"
  | "milestones"
  | "watchlistInvites"
  | "follows"
  // Push-only categories — see schema comment on pushPrefs. No
  // matching key exists on notificationPrefs; the in-app side is
  // governed by the upstream opt-in (companion follow,
  // watchlistStreamingNotifs, StreamingWatch row, Movie Club
  // membership).
  | "companionUpdates"
  | "streamingAlerts"
  | "movieClub";

export interface PushPrefs {
  commentOnContent: boolean;
  likeOnContent: boolean;
  commentReplies: boolean;
  commentLikes: boolean;
  milestones: boolean;
  watchlistInvites: boolean;
  follows: boolean;
  companionUpdates: boolean;
  streamingAlerts: boolean;
  movieClub: boolean;
}

const DEFAULT_PUSH_PREFS: PushPrefs = {
  commentOnContent: true,
  likeOnContent: true,
  commentReplies: true,
  commentLikes: true,
  milestones: true,
  watchlistInvites: true,
  follows: true,
  companionUpdates: true,
  streamingAlerts: true,
  movieClub: true,
};

export function parsePushPrefs(raw: unknown): PushPrefs {
  if (raw && typeof raw === "object") {
    return { ...DEFAULT_PUSH_PREFS, ...(raw as Partial<PushPrefs>) };
  }
  return DEFAULT_PUSH_PREFS;
}

export function shouldSendPush(raw: unknown, category: PushCategory): boolean {
  return parsePushPrefs(raw)[category];
}

// ─── Send ───────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  /** URL the click handler navigates to. Defaults to "/". */
  url?: string;
  /** Replaces any prior notification with the same tag (e.g. per-thread). */
  tag?: string;
  /** Override icon. Defaults to /icon-192.png in the SW. */
  icon?: string;
  /** Extra structured data accessible in notificationclick. */
  data?: Record<string, unknown>;
}

interface SendOptions {
  category?: PushCategory;
}

/**
 * Fan a push to every active subscription AND FCM token for a user.
 * Prunes dead entries on the fly so the user_id indexes don't
 * accumulate stale rows.
 *
 * Non-critical — never throws. Returns counts for observability.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: SendOptions = {},
): Promise<{ sent: number; pruned: number; skipped: number }> {
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushPrefs: true,
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
        fcmTokens: {
          select: { id: true, token: true, platform: true },
        },
      },
    });
  } catch (err) {
    console.error("[push] user lookup failed:", err);
    return { sent: 0, pruned: 0, skipped: 0 };
  }
  if (!user) {
    console.warn("[push] user not found:", userId);
    return { sent: 0, pruned: 0, skipped: 0 };
  }

  if (opts.category && !shouldSendPush(user.pushPrefs, opts.category)) {
    return {
      sent: 0,
      pruned: 0,
      skipped: user.pushSubscriptions.length + user.fcmTokens.length,
    };
  }

  const totalTargets = user.pushSubscriptions.length + user.fcmTokens.length;
  if (totalTargets === 0) return { sent: 0, pruned: 0, skipped: 0 };

  let sent = 0;
  let pruned = 0;
  const deadWebPushIds: string[] = [];
  const deadFcmIds: string[] = [];

  // ── Web Push transport ──
  if (user.pushSubscriptions.length > 0 && configureWebPush()) {
    const wpBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      tag: payload.tag,
      icon: payload.icon,
      data: payload.data,
    });
    await Promise.all(
      user.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            wpBody,
          );
          sent += 1;
        } catch (err: unknown) {
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode?: number }).statusCode
              : undefined;
          if (status === 410 || status === 404) {
            deadWebPushIds.push(sub.id);
          } else {
            console.error("[push] Web Push send failed:", status, err);
          }
        }
      }),
    );
  }

  // ── FCM transport (native Capacitor apps) ──
  if (user.fcmTokens.length > 0) {
    try {
      const messaging = getMessaging(getAdminApp());
      const tokens = user.fcmTokens.map((t) => t.token);
      const url = payload.url ?? "/";
      // Minimal payload — extra android.notification config (channelId,
      // custom icon, etc.) can cause Android to silently drop the
      // notification if the channel doesn't exist or the icon resource
      // isn't bundled. The Capacitor Messaging plugin handles channels +
      // icons via its own defaults, so we only specify what we strictly
      // need (priority + the data payload for the click handler).
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: {
          url,
          ...(payload.tag ? { tag: payload.tag } : {}),
          ...(payload.data
            ? Object.fromEntries(
                Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
              )
            : {}),
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      });
      console.log("[push] FCM sendEachForMulticast", {
        userId,
        tokenCount: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });
      response.responses.forEach((r, i) => {
        if (r.success) {
          sent += 1;
        } else {
          // Token no longer valid → prune. Known FCM error codes:
          // - messaging/registration-token-not-registered
          // - messaging/invalid-registration-token
          // - messaging/invalid-argument (sometimes for unregistered)
          const code = r.error?.code;
          // Log every non-success — code + message tell us exactly
          // why FCM rejected, and lets us decide whether to add new
          // codes to the prune list above.
          console.error("[push] FCM per-token failure:", {
            tokenFirst8: user.fcmTokens[i].token.slice(0, 8) + "...",
            code,
            message: r.error?.message,
          });
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument"
          ) {
            deadFcmIds.push(user.fcmTokens[i].id);
          }
        }
      });
    } catch (err) {
      // Transport-level failure (e.g. Firebase admin not configured,
      // Cloud Messaging API disabled, private key newline corruption).
      // Logged with full stack — check Vercel runtime logs to diagnose.
      // Live tokens stay so the next attempt can retry.
      console.error("[push] FCM transport error (sendEachForMulticast threw):", err);
    }
  } else if (user.fcmTokens.length > 0) {
    // Defensive: this branch is unreachable today because the outer
    // `if` already filters, but if someone ever refactors the gate
    // and breaks it, we want a loud signal.
    console.warn("[push] FCM tokens present but transport branch skipped?", { userId });
  }

  // ── Pruning ──
  if (deadWebPushIds.length > 0) {
    try {
      const r = await prisma.pushSubscription.deleteMany({
        where: { id: { in: deadWebPushIds } },
      });
      pruned += r.count;
    } catch (err) {
      console.warn("[push] Web Push pruning failed:", err);
    }
  }
  if (deadFcmIds.length > 0) {
    try {
      const r = await prisma.fcmToken.deleteMany({
        where: { id: { in: deadFcmIds } },
      });
      pruned += r.count;
    } catch (err) {
      console.warn("[push] FCM pruning failed:", err);
    }
  }

  // Touch lastUsed for any send that succeeded.
  if (sent > 0) {
    try {
      await Promise.all([
        prisma.pushSubscription.updateMany({
          where: { userId, id: { notIn: deadWebPushIds.length ? deadWebPushIds : ["__none__"] } },
          data: { lastUsed: new Date() },
        }),
        prisma.fcmToken.updateMany({
          where: { userId, id: { notIn: deadFcmIds.length ? deadFcmIds : ["__none__"] } },
          data: { lastUsed: new Date() },
        }),
      ]);
    } catch {
      // Non-critical.
    }
  }

  return { sent, pruned, skipped: 0 };
}
