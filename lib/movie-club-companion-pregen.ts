/**
 * Pre-generates a Watch Companion for a Movie Club week's chosen movie,
 * timed so the companion is live by the moment the announce notification
 * fires. Two callers:
 *
 *   1. Mon 13:00 UTC pregen cron (1 hour before the Mon 14:00 UTC
 *      announce). Random-pick weeks have their movie assigned at this
 *      same time so we have something to gen against.
 *   2. Wed-evening vote-resolve path (Thu 02:00 UTC cron). After
 *      resolveVoteWinner picks the winning movie, we synchronously
 *      pregen the companion BEFORE the announce notification — so vote
 *      participants who tap the push immediately see the companion.
 *
 * System-initiated. Does NOT consume the originating user's weekly
 * companion allotment (that gate lives on the user-facing endpoint, not
 * generateCompanionStream). Eligibility rules still apply — movies
 * still in theaters / unreleased are skipped silently (matches the
 * user's stated requirement).
 *
 * Auto-publishes the companion on success because the admin draft-
 * review window doesn't exist in this flow — the announce notification
 * is timed against the companion being live.
 */

import { prisma } from "@/lib/prisma";
import { generateCompanionStream } from "@/lib/ai/watch-companion-generate";
import { isCompanionEligible } from "@/lib/companion-eligibility";

export type PregenStatus =
  | "generated"
  | "already_exists"
  | "no_movie"
  | "not_eligible"
  | "no_admin"
  | "failed";

export interface PregenResult {
  status: PregenStatus;
  reason?: string;
}

export async function pregenWatchCompanionForWeek(weekId: string): Promise<PregenResult> {
  const week = await prisma.movieClubWeek.findUnique({
    where: { id: weekId },
    select: { movieTmdbId: true },
  });
  if (!week?.movieTmdbId) return { status: "no_movie" };

  const tmdbId = week.movieTmdbId;

  // Already-generated guard. A movie-club pick that's been generated
  // for a prior surface (e.g. an admin manually generated it earlier
  // this week) re-uses the existing companion — we don't double-gen.
  const existing = await prisma.watchCompanion.findFirst({
    where: { tmdbId, mediaType: "movie" },
    select: { id: true, status: true },
  });
  if (existing) {
    // If the companion exists but is still in draft, surface it so
    // the announce can include it. Skip the gen step but do publish.
    if (existing.status === "draft") {
      await prisma.watchCompanion.update({
        where: { id: existing.id },
        data: { status: "published", publishedAt: new Date() },
      });
    }
    return { status: "already_exists" };
  }

  const eligibility = await isCompanionEligible("movie", tmdbId);
  if (!eligibility.eligible) {
    return { status: "not_eligible", reason: eligibility.reason ?? undefined };
  }

  // Attribute the gen to the oldest admin in the system. The schema
  // requires a non-null generatedByUserId — the gen pipeline writes
  // it onto the WatchCompanion row for audit. There's no "system"
  // user, so picking the most-stable admin (oldest createdAt) keeps
  // the attribution sensible across rebuilds.
  const admin = await prisma.user.findFirst({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return { status: "no_admin" };

  try {
    for await (const evt of generateCompanionStream({
      tmdbId,
      mediaType: "movie",
      generatedByUserId: admin.id,
    })) {
      if (evt.kind === "error") {
        return { status: "failed", reason: evt.message };
      }
    }

    // Auto-publish. Skips the admin review window because the announce
    // notification is about to fire — a draft companion would defeat
    // the whole point of the pre-gen.
    await prisma.watchCompanion.updateMany({
      where: { tmdbId, mediaType: "movie", status: "draft" },
      data: { status: "published", publishedAt: new Date() },
    });

    return { status: "generated" };
  } catch (err) {
    return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
