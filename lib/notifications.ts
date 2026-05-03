import { prisma } from "@/lib/prisma";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotifyOpts {
  recipientId: string;       // who receives the notification
  actorId: string;           // who triggered it
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
}

// ─── Milestones ─────────────────────────────────────────────────────────────

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000];

// ─── Cooldown (5 minutes) ───────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000;

// ─── Pref key mapping ───────────────────────────────────────────────────────

function getPrefKey(type: string): keyof NotificationPrefs | null {
  switch (type) {
    case "comment": return "commentOnContent";
    case "post_like": return "likeOnContent";
    case "reply": return "commentReplies";
    case "comment_like": return "commentLikes";
    case "milestone": return "milestones";
    case "watchlist_invite":
    case "invite_accepted": return "watchlistInvites";
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
    // job, not a peer action).
    if (opts.recipientId === opts.actorId && !opts.allowSelfNotify) return;

    // Check recipient preferences
    const recipient = await prisma.user.findUnique({
      where: { id: opts.recipientId },
      select: { notificationPrefs: true },
    });
    if (recipient) {
      const prefs = (recipient.notificationPrefs ?? {}) as NotificationPrefs;
      const key = getPrefKey(opts.type);
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

    await prisma.notification.create({
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
  } catch {
    // Non-critical — don't break the main action
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
