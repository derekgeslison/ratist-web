import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

/**
 * Fan out a "new episode companion is ready" notification to every user
 * following this companion. Fires once per (companion, season, episode)
 * — the targetId is built so that two episodes generated within the
 * notify-cooldown window each get through (the cooldown dedup checks
 * the full targetId).
 *
 * Intended to be called by the cron sweep after a successful episode-
 * mode generation. Self-follower (the original generator) is skipped by
 * notify() automatically.
 */
export async function notifyFollowersOfNewEpisode(opts: {
  companionId: string;
  season: number;
  episode: number;
  actorId: string;
}): Promise<void> {
  const { companionId, season, episode, actorId } = opts;
  try {
    const companion = await prisma.watchCompanion.findUnique({
      where: { id: companionId },
      select: { tmdbId: true, mediaType: true, title: true },
    });
    if (!companion || companion.mediaType !== "tv") return;

    const followers = await prisma.companionFollow.findMany({
      where: { companionId },
      select: { userId: true },
    });
    if (followers.length === 0) return;

    // Deep link carries season + episode so the viewer can jump the
    // slider directly to the new episode's position (the page reads
    // ?s=&e= on mount).
    const link = `/shows/${companion.tmdbId}/companion?s=${season}&e=${episode}`;
    const message = `${companion.title} S${season}E${episode}'s Watch Companion is ready!`;
    // Per-episode targetId so two episodes generated within the 5-min
    // notify cooldown both make it through. Without this, a back-fill
    // sweep that runs episodes 4 and 5 in the same pass would silently
    // suppress one of them.
    const targetId = `${companionId}:s${season}e${episode}`;

    for (const f of followers) {
      await notify({
        recipientId: f.userId,
        actorId,
        type: "watch_companion_episode",
        targetType: "watch_companion",
        targetId,
        message,
        link,
      });
    }
  } catch (err) {
    console.error("notifyFollowersOfNewEpisode failed (non-fatal):", err);
  }
}

/**
 * Fan out a "season is now complete" notification to every follower when
 * a season finalizes (last episode + 2 day buffer has passed AND every
 * episode has been generated AND recap chunks have run). Intended to be
 * called once per (companion, season) at finalization time.
 */
export async function notifyFollowersOfSeasonFinalized(opts: {
  companionId: string;
  season: number;
  actorId: string;
}): Promise<void> {
  const { companionId, season, actorId } = opts;
  try {
    const companion = await prisma.watchCompanion.findUnique({
      where: { id: companionId },
      select: { tmdbId: true, mediaType: true, title: true },
    });
    if (!companion || companion.mediaType !== "tv") return;

    const followers = await prisma.companionFollow.findMany({
      where: { companionId },
      select: { userId: true },
    });
    if (followers.length === 0) return;

    const link = `/shows/${companion.tmdbId}/companion?s=${season}`;
    const message = `${companion.title} Season ${season} is complete — full season recap is now available.`;
    const targetId = `${companionId}:s${season}:final`;

    for (const f of followers) {
      await notify({
        recipientId: f.userId,
        actorId,
        type: "watch_companion_season_complete",
        targetType: "watch_companion",
        targetId,
        message,
        link,
      });
    }
  } catch (err) {
    console.error("notifyFollowersOfSeasonFinalized failed (non-fatal):", err);
  }
}

/**
 * Fire "companion ready" notifications to any users who had open requests
 * for this companion's target. Marks those requests fulfilled + stamps the
 * notifiedAt so we don't double-notify on subsequent regenerations.
 *
 * Intended to be called after a companion first transitions to "published"
 * (whether from the admin publish endpoint or the user-triggered auto-
 * publish flow). Never throws — notification failure shouldn't break the
 * publish path.
 */
export async function notifyCompanionRequesters(companionId: string, actorId: string): Promise<void> {
  try {
    const companion = await prisma.watchCompanion.findUnique({
      where: { id: companionId },
      select: { id: true, title: true, tmdbId: true, mediaType: true, seasonsGenerated: true },
    });
    if (!companion) return;

    const targetPath = companion.mediaType === "movie"
      ? `/movies/${companion.tmdbId}/companion`
      : `/shows/${companion.tmdbId}/companion`;

    const pending = await prisma.companionGenerationRequest.findMany({
      where: {
        tmdbId: companion.tmdbId,
        mediaType: companion.mediaType,
        status: { in: ["pending", "approved"] },
        notifiedAt: null,
        // Season-less requests match any published season; season-specific
        // requests only match if that season was included in the generation.
        OR: [
          { season: null },
          { season: { in: companion.seasonsGenerated } },
        ],
      },
    });

    for (const req of pending) {
      await notify({
        recipientId: req.requesterId,
        actorId,
        type: "companion_ready",
        targetType: "watch_companion",
        targetId: companion.id,
        message: `Your Watch Companion for ${companion.title}${req.season ? ` · S${req.season}` : ""} is ready!`,
        link: targetPath,
      });
    }

    if (pending.length > 0) {
      await prisma.companionGenerationRequest.updateMany({
        where: { id: { in: pending.map((r) => r.id) } },
        data: { status: "fulfilled", companionId: companion.id, notifiedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("notifyCompanionRequesters failed (non-fatal):", err);
  }
}
