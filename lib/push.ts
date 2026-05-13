import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Web Push wiring. Mirrors lib/email.ts shape: prefs gate + a single
// fan-out send. Categories match the in-app notificationPrefs keys
// (settings page exposes them under "Notification Preferences").

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@theratist.com";

let configured = false;
function configure() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type PushCategory =
  | "commentOnContent"
  | "likeOnContent"
  | "commentReplies"
  | "commentLikes"
  | "milestones"
  | "watchlistInvites";

export interface PushPrefs {
  commentOnContent: boolean;
  likeOnContent: boolean;
  commentReplies: boolean;
  commentLikes: boolean;
  milestones: boolean;
  watchlistInvites: boolean;
}

const DEFAULT_PUSH_PREFS: PushPrefs = {
  commentOnContent: true,
  likeOnContent: true,
  commentReplies: true,
  commentLikes: true,
  milestones: true,
  watchlistInvites: true,
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
 * Fan a push to every active subscription for a user. Prunes dead
 * subscriptions (410 Gone / 404 from the push service) on the fly so
 * the user_id index doesn't accumulate stale rows.
 *
 * Non-critical — never throws. Returns counts for observability.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: SendOptions = {},
): Promise<{ sent: number; pruned: number; skipped: number }> {
  if (!configure()) {
    return { sent: 0, pruned: 0, skipped: 0 };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushPrefs: true,
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
      },
    });
  } catch {
    return { sent: 0, pruned: 0, skipped: 0 };
  }
  if (!user) return { sent: 0, pruned: 0, skipped: 0 };

  if (opts.category && !shouldSendPush(user.pushPrefs, opts.category)) {
    return { sent: 0, pruned: 0, skipped: user.pushSubscriptions.length };
  }
  if (user.pushSubscriptions.length === 0) {
    return { sent: 0, pruned: 0, skipped: 0 };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    icon: payload.icon,
    data: payload.data,
  });

  let sent = 0;
  const deadIds: string[] = [];

  await Promise.all(
    user.pushSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        sent += 1;
      } catch (err: unknown) {
        // 410 Gone / 404 Not Found = subscription expired or revoked.
        // Anything else (network blip, server 5xx) we let live and try
        // again on the next push.
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 410 || status === 404) deadIds.push(sub.id);
      }
    }),
  );

  let pruned = 0;
  if (deadIds.length > 0) {
    try {
      const r = await prisma.pushSubscription.deleteMany({
        where: { id: { in: deadIds } },
      });
      pruned = r.count;
    } catch {
      // Pruning failure is fine — the next send pass will try again.
    }
  }

  // Touch lastUsed so the user can see which devices are active in
  // a future "manage devices" surface, and so we can later GC very
  // stale subscriptions if browsers stop revoking them properly.
  if (sent > 0) {
    try {
      await prisma.pushSubscription.updateMany({
        where: {
          userId,
          id: { notIn: deadIds.length ? deadIds : ["__none__"] },
        },
        data: { lastUsed: new Date() },
      });
    } catch {
      // Non-critical.
    }
  }

  return { sent, pruned, skipped: 0 };
}
