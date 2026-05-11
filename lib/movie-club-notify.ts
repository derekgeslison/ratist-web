/**
 * Movie Club lifecycle notifications.
 *
 * Fires in-app notifications to all MovieClubMember users when a week
 * crosses one of the four observable boundaries:
 *
 *   - scheduled → voting              (community_vote weeks: nominations open)
 *   - scheduled → watching            (random/admin weeks: pick announced)
 *   - voting    → watching            (community_vote weeks: voting closed, pick announced)
 *   - watching  → discussion          (any week: discussion opens)
 *
 * Other transitions (discussion → archived, manual jumps) emit
 * nothing. Membership IS the opt-in — leaving the club stops the pings.
 *
 * Called from both `runStatusTransitions()` (cron path) and the admin
 * PATCH route (manual override path) so the source of the transition
 * doesn't matter. The shared `notify()` cooldown (5min, keyed on
 * userId+type+targetId) guards against double-firing if both paths
 * land on the same transition within the same window.
 */

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { activeBackstageUserWhere } from "@/lib/subscription";

interface WeekSnapshot {
  id: string;
  status: string;
  movieTitle: string | null;
}

const MOVIE_CLUB_LINK = "/community/movie-club";

function resolveTransition(before: WeekSnapshot, after: WeekSnapshot): { type: string; message: string } | null {
  if (before.status === after.status) return null;

  if (before.status === "scheduled" && after.status === "voting") {
    return {
      type: "movieclub_voting_open",
      message: "Movie Club voting is open — nominate a film and vote on this week's pick.",
    };
  }

  if (before.status === "scheduled" && after.status === "watching" && after.movieTitle) {
    return {
      type: "movieclub_announced",
      message: `This week's Movie Club pick: ${after.movieTitle}.`,
    };
  }

  if (before.status === "voting" && after.status === "watching" && after.movieTitle) {
    return {
      type: "movieclub_voting_closed",
      message: `Voting closed — this week's Movie Club pick: ${after.movieTitle}.`,
    };
  }

  if (before.status === "watching" && after.status === "discussion") {
    return {
      type: "movieclub_discussion_open",
      message: after.movieTitle
        ? `Discussion is open for ${after.movieTitle} — share your thoughts.`
        : "Movie Club discussion is open — share your thoughts.",
    };
  }

  return null;
}

/**
 * Notify all Movie Club members about a status transition. Caller passes
 * the pre-update status + movie title; the helper fetches the post-
 * update state itself, so callers don't have to re-query. Best-effort:
 * never throws — a failed notify shouldn't unwind the underlying state
 * change.
 */
export async function notifyMovieClubTransition(
  weekId: string,
  beforeStatus: string,
  beforeMovieTitle: string | null,
): Promise<void> {
  try {
    const after = await prisma.movieClubWeek.findUnique({
      where: { id: weekId },
      select: { id: true, status: true, movieTitle: true },
    });
    if (!after) return;

    const before: WeekSnapshot = { id: weekId, status: beforeStatus, movieTitle: beforeMovieTitle };
    const event = resolveTransition(before, after);
    if (!event) return;

    // MovieClubMember rows are intentionally retained past Pass expiry
    // (so re-subscribers don't have to rejoin), but Movie Club is a
    // Pass-only feature — only currently-active subscribers should get
    // its pings. Gate via the shared `activeBackstageUserWhere()`
    // (matches the same surfaces that decide who's a "real" member —
    // /backstage-pass/movie-club, /community page count, profile badge).
    const members = await prisma.movieClubMember.findMany({
      where: { user: activeBackstageUserWhere() },
      select: { userId: true },
    });
    if (members.length === 0) return;

    await Promise.all(
      members.map((m) =>
        notify({
          recipientId: m.userId,
          actorId: null,
          type: event.type,
          targetType: "movieclub_week",
          targetId: after.id,
          message: event.message,
          link: MOVIE_CLUB_LINK,
        }).catch(() => { /* non-critical */ })
      )
    );
  } catch {
    /* non-critical */
  }
}
