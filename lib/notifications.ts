import { prisma } from "@/lib/prisma";
import { sendPushToUser, type PushCategory } from "@/lib/push";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotifyOpts {
  recipientId: string;       // who receives the notification
  /** Who triggered it. Pass `null` for system-triggered events (cron
   *  transitions, scheduled announcements) where there's no peer
   *  actor to attribute the action to. */
  actorId: string | null;
  type: string;              // "comment" | "reply" | "comment_like" | "post_like" | "milestone" | "invite_accepted"
  targetType: string;        // "review" | "blog" | "lookslike" | "recast" | "hottake" | "oscar_category" | "watchlist"
  targetId: string;
  message: string;
  link?: string;             // URL to navigate to
  /** Allow recipient === actor. For passive notifications (someone
   *  liked/commented on your stuff) the self-skip is a sanity guard.
   *  For opt-in subscriptions (Watch Companion follow → per-episode
   *  pings) the original generator may still want the notification,
   *  since the cron — not the user — is what fired the gen. */
  allowSelfNotify?: boolean;
}

interface NotificationPrefs {
  commentOnContent?: boolean;
  likeOnContent?: boolean;
  commentReplies?: boolean;
  commentLikes?: boolean;
  milestones?: boolean;
  watchlistInvites?: boolean;
  follows?: boolean;
}

// ─── Notification deep-link helper ──────────────────────────────────────────

/** Append `?notif=<id>` to a relative URL, preserving any existing
 *  query string and hash fragment. Used so the page that opens from
 *  a push tap can auto-mark-as-read on load. */
function appendNotifId(path: string, id: string): string {
  // Find the hash and strip it off temporarily; we re-attach at the end.
  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}notif=${encodeURIComponent(id)}${hash}`;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000];

// ─── Cooldown (5 minutes) ───────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000;

// ─── Pref key mapping ───────────────────────────────────────────────────────

// In-app notification pref. Returning null means this type is NOT
// gated by an in-app pref — the in-app notification always fires
// when the upstream system (cron, follow gesture, etc.) calls notify().
// Use this for types whose in-app source is governed elsewhere
// (e.g. watch-companion notifications fire because the user follows
// a season — unfollowing is the in-app off-switch).
function getInAppPrefKey(type: string): keyof NotificationPrefs | null {
  switch (type) {
    case "comment": return "commentOnContent";
    case "post_like": return "likeOnContent";
    case "reply": return "commentReplies";
    case "comment_like": return "commentLikes";
    case "milestone": return "milestones";
    case "watchlist_invite":
    case "invite_accepted": return "watchlistInvites";
    case "follow":
    case "follow_request":
    case "follow_request_accepted": return "follows";
    default: return null;
  }
}

// Push delivery pref. Returning null means push is NOT attempted for
// this type. The mapped key is checked against pushPrefs[key] inside
// sendPushToUser; if disabled, push is suppressed while the in-app
// notification still lives in the bell-icon feed.
//
// companionUpdates / streamingAlerts are push-only categories with
// no in-app counterpart — see schema comment on pushPrefs.
function getPushPrefKey(type: string): string | null {
  switch (type) {
    case "comment": return "commentOnContent";
    case "post_like": return "likeOnContent";
    case "reply": return "commentReplies";
    case "comment_like": return "commentLikes";
    case "milestone": return "milestones";
    case "watchlist_invite":
    case "invite_accepted": return "watchlistInvites";
    case "follow":
    case "follow_request":
    case "follow_request_accepted": return "follows";
    case "watch_companion_episode":
    case "watch_companion_season_complete":
    case "companion_ready": return "companionUpdates";
    case "watchlist_streaming":
    case "streaming_now_available": return "streamingAlerts";
    default: return null;
  }
}

// ─── Main notification creator ──────────────────────────────────────────────

/**
 * Create a notification with deduplication and preference checks.
 * Non-critical — never throws.
 */
export async function notify(opts: NotifyOpts): Promise<void> {
  try {
    // Don't notify yourself, unless the caller explicitly opts in
    // (subscription-style notifications where the actor is a backend
    // job, not a peer action). System-triggered notifications (null
    // actor) bypass the self-check entirely.
    if (opts.actorId !== null && opts.recipientId === opts.actorId && !opts.allowSelfNotify) return;

    // Check recipient preferences
    const recipient = await prisma.user.findUnique({
      where: { id: opts.recipientId },
      select: { notificationPrefs: true },
    });
    if (recipient) {
      const prefs = (recipient.notificationPrefs ?? {}) as NotificationPrefs;
      const key = getInAppPrefKey(opts.type);
      if (key && prefs[key] === false) return; // user opted out
    }

    // Cooldown dedup: skip if same type+target was notified recently
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);
    const recent = await prisma.notification.findFirst({
      where: {
        userId: opts.recipientId,
        type: opts.type,
        targetType: opts.targetType,
        targetId: opts.targetId,
        createdAt: { gte: cooldownCutoff },
      },
    });
    if (recent) return; // within cooldown window

    const created = await prisma.notification.create({
      data: {
        userId: opts.recipientId,
        type: opts.type,
        actorId: opts.actorId,
        targetType: opts.targetType,
        targetId: opts.targetId,
        link: opts.link ?? null,
        message: opts.message,
      },
    });

    // Mirror to push. Fire-and-forget — push is best-effort and the
    // in-app notification is the source of truth. The push gate on
    // pushPrefs[category] is the second filter; notificationPrefs is
    // already satisfied by getting here.
    //
    // We append ?notif=<id> to the URL so that when the user taps the
    // push and lands on the target page, a global client component
    // can detect the param and mark the in-app notification as read
    // automatically. Without this, the same notification would still
    // show as unread in the bell-icon list after they viewed the
    // underlying content via the push.
    const pushKey = getPushPrefKey(opts.type);
    if (pushKey) {
      const baseUrl = opts.link ?? "/notifications";
      const url = appendNotifId(baseUrl, created.id);
      sendPushToUser(
        opts.recipientId,
        {
          title: "The Ratist",
          body: opts.message,
          url,
          tag: `${opts.type}:${opts.targetType}:${opts.targetId}`,
          data: { notificationId: created.id },
        },
        { category: pushKey as PushCategory },
      ).catch((err) => {
        // Async failures inside sendPushToUser used to vanish because
        // it was fired with `void`. Log them so we can actually see
        // FCM transport problems in Vercel runtime logs.
        console.error("[notify] sendPushToUser rejected:", err);
      });
    }
  } catch (err) {
    // Non-critical — don't break the main action. But do log so we
    // can see if notify() itself is throwing (e.g. Prisma create
    // failure) instead of dying silently.
    console.error("[notify] failed:", err);
  }
}

// ─── Milestone checker ──────────────────────────────────────────────────────

/**
 * Check if a count just crossed a milestone threshold. If so, send a
 * milestone notification to the content owner.
 */
export async function checkMilestone(opts: {
  contentOwnerId: string;
  actorId: string;
  targetType: string;
  targetId: string;
  currentCount: number;
  countLabel: string;  // e.g. "likes" or "comments"
  contentLabel: string; // e.g. "your review" or "your post"
  link?: string;
}): Promise<void> {
  const milestone = MILESTONES.find((m) => opts.currentCount === m);
  if (!milestone) return;

  await notify({
    recipientId: opts.contentOwnerId,
    actorId: opts.actorId,
    type: "milestone",
    targetType: opts.targetType,
    targetId: opts.targetId,
    message: `${opts.contentLabel} now has ${milestone} ${opts.countLabel}!`,
    link: opts.link,
  });
}

// ─── Link builders ──────────────────────────────────────────────────────────

/** Build a link URL for a notification target. Requires some context. */
export function buildReviewLink(movieTmdbId: number, reviewId: string): string {
  return `/movies/${movieTmdbId}/reviews/${reviewId}`;
}

export function buildBlogLink(slug: string): string {
  return `/blog/${slug}`;
}

export function buildTwoThumbsLink(slug: string): string {
  return `/two-thumbs/${slug}`;
}
/** @deprecated Use buildTwoThumbsLink */
export const buildPunchAndJudyLink = buildTwoThumbsLink;

export function buildMovieMapLink(slug: string): string {
  return `/movie-maps/${slug}`;
}

/**
 * Resolve a navigable URL for a comment-bearing target. Centralizes link
 * lookup so comment-like and comment-reply notifications stay in sync
 * across every supported target type — the per-route inline if/else
 * chains had drifted (likes only covered review/blog; replies missed
 * news/pitch/movieclub).
 *
 * Pass `commentId` to append a `#comment-<id>` anchor so clicking the
 * notification scrolls to the specific comment rather than the page top.
 *
 * Returns null when the target row is missing or the type isn't
 * recognized — caller should treat null the same as "no link" and let
 * the notification render as plain text.
 */
export async function getCommentTargetLink(
  targetType: string,
  targetId: string,
  opts?: { commentId?: string },
): Promise<string | null> {
  let base: string | null = null;
  try {
    switch (targetType) {
      case "review": {
        const r = await prisma.movieRating.findUnique({
          where: { id: targetId },
          select: { movie: { select: { tmdbId: true } } },
        });
        if (r) base = buildReviewLink(r.movie.tmdbId, targetId);
        break;
      }
      case "blog": {
        const p = await prisma.blogPost.findUnique({
          where: { id: targetId },
          select: { slug: true, type: true },
        });
        if (p) {
          if (p.type === "PUNCH_AND_JUDY") base = buildTwoThumbsLink(p.slug);
          else if (p.type === "MOVIE_MAP") base = buildMovieMapLink(p.slug);
          else base = buildBlogLink(p.slug);
        }
        break;
      }
      case "news": {
        const n = await prisma.newsItem.findUnique({
          where: { id: targetId },
          select: { slug: true },
        });
        if (n?.slug) base = `/news/${n.slug}`;
        break;
      }
      case "forumThread": {
        const t = await prisma.forumThread.findUnique({
          where: { id: targetId },
          select: { slug: true },
        });
        if (t) base = `/forum/t/${t.slug}`;
        break;
      }
      case "collection": {
        const c = await prisma.customCollection.findUnique({
          where: { id: targetId },
          select: { slug: true, user: { select: { firebaseUid: true } } },
        });
        if (c?.slug) base = `/collections/${c.user.firebaseUid}/${c.slug}`;
        break;
      }
      // Community pages — no per-item URL, but the destination page
      // does render and surface the item.
      case "lookslike":       base = "/community/looks-like"; break;
      case "recast":          base = "/community/recast"; break;
      case "hottake":         base = "/community/hot-takes"; break;
      case "oscar_category":  base = "/community/oscar-picks"; break;
      case "pitch":           base = "/community/pitches"; break;
      case "movieclub":
      case "movieclub_prompt": base = "/community/movie-club"; break;
    }
  } catch {
    return null; // non-critical — drop the link rather than throw
  }
  if (!base) return null;
  return opts?.commentId ? `${base}#comment-${opts.commentId}` : base;
}
