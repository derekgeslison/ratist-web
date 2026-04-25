import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWatchProviders, getShowWatchProviders } from "@/lib/tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily sweep over StreamingWatch rows whose notification hasn't fired
// yet. For each unique (tmdbId, mediaType), we make ONE TMDB call and
// then apply the result to every user-row sharing that target — so 100
// users watching the same movie costs 1 TMDB call, not 100.
//
// "Now streaming" = US flatrate array is non-empty in TMDB's
// /watch/providers response. Rent/buy entries don't trigger; the user
// asked specifically for streaming-availability alerts, distinct from
// rentals which don't materially change their access pattern.
//
// Secured by CRONSECRET (matches the other cron routes).

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await prisma.streamingWatch.findMany({
      where: { notifiedAt: null },
      select: { id: true, userId: true, tmdbId: true, mediaType: true },
    });

    if (pending.length === 0) {
      return NextResponse.json({ scanned: 0, notified: 0, byTarget: 0 });
    }

    // Group by (tmdbId, mediaType) so we hit TMDB once per title.
    const byTarget = new Map<string, { tmdbId: number; mediaType: "movie" | "tv"; rows: typeof pending }>();
    for (const p of pending) {
      const key = `${p.mediaType}:${p.tmdbId}`;
      const bucket = byTarget.get(key);
      const mediaType = p.mediaType === "tv" ? "tv" : "movie";
      if (bucket) bucket.rows.push(p);
      else byTarget.set(key, { tmdbId: p.tmdbId, mediaType, rows: [p] });
    }

    let notified = 0;
    const errors: string[] = [];

    for (const [, group] of byTarget) {
      try {
        const providers = group.mediaType === "tv"
          ? await getShowWatchProviders(group.tmdbId).catch(() => null)
          : await getWatchProviders(group.tmdbId).catch(() => null);
        const flatrate = providers?.flatrate ?? [];
        if (flatrate.length === 0) continue;

        // Lookup the title for the notification message. Local DB hit
        // is much cheaper than another TMDB call, and we keep these
        // rows hot via site traffic.
        const titleRow = group.mediaType === "tv"
          ? await prisma.tVShow.findUnique({ where: { tmdbId: group.tmdbId }, select: { name: true } })
          : await prisma.movie.findUnique({ where: { tmdbId: group.tmdbId }, select: { title: true } });
        const title = group.mediaType === "tv"
          ? titleRow && "name" in titleRow ? titleRow.name : null
          : titleRow && "title" in titleRow ? titleRow.title : null;
        if (!title) continue; // Skip if we can't name it — better than silent garbage.

        // Provider names for the notification message ("Netflix is now
        // streaming Hoppers"). Use the first 2 to keep the message
        // short; the user can tap through to see all of them.
        const providerNames = flatrate
          .map((p) => p.provider_name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .slice(0, 2);
        const providerLabel = providerNames.length === 0
          ? "streaming"
          : providerNames.length === 1
            ? providerNames[0]
            : `${providerNames[0]} and ${providerNames.length - 1} more`;

        const link = group.mediaType === "tv"
          ? `/shows/${group.tmdbId}`
          : `/movies/${group.tmdbId}`;

        for (const row of group.rows) {
          // System-driven notification — no real actor. Write directly
          // to the Notification table since notify()'s self-recipient
          // short-circuit doesn't apply (and actorId is nullable on
          // the model anyway). Best-effort: errors here shouldn't
          // block the row from being marked notified, otherwise a
          // single bad write would re-fire daily.
          try {
            await prisma.notification.create({
              data: {
                userId: row.userId,
                actorId: null,
                type: "streaming_now_available",
                targetType: group.mediaType === "tv" ? "tv_show" : "movie",
                targetId: String(group.tmdbId),
                message: `${title} is now streaming on ${providerLabel}!`,
                link,
              },
            });
          } catch (err) {
            console.error("streaming-watch notification create failed:", err);
          }
          await prisma.streamingWatch.update({
            where: { id: row.id },
            data: {
              notifiedAt: new Date(),
              notifiedProviders: flatrate.map((p) => p.provider_name).join(", ").slice(0, 500),
            },
          });
          notified++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${group.mediaType}:${group.tmdbId} — ${msg}`);
      }
    }

    return NextResponse.json({
      scanned: pending.length,
      byTarget: byTarget.size,
      notified,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.error("streaming-watch-sweep error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
