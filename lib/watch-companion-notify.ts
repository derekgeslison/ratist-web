import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

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
