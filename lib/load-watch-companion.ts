// Server-side loader for WatchCompanionData. Mirrors the inline
// loading in app/movies/[id]/companion/page.tsx but lives in lib/ so
// the new /api/watch-companion/by-tmdb endpoint (consumed by the
// Screening Room integration) can share the same data shape.
//
// Movie-only for now. TV is more involved (per-season payloads,
// airing-status seasons, recap stitching across seasons) and the
// initial Screening Room integration scope is movies anyway. Add a
// matching `loadShowWatchCompanion` if/when TV gets the integration.

import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import type { WatchCompanionData } from "@/components/watch-companion/WatchCompanionView";

export async function loadMovieWatchCompanion(tmdbId: number): Promise<WatchCompanionData | null> {
  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "movie" } },
    include: {
      characters: {
        include: { facts: true, actors: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      relationships: true,
      timeline: true,
      glossary: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!companion || companion.status !== "published") return null;

  // Resolve actor portraits: every actor on the primary char + any
  // side-table actor row. Mirrors getActorImageMap from the movie page.
  const actorIdSet = new Set<number>();
  for (const c of companion.characters) {
    if (typeof c.actorTmdbId === "number") actorIdSet.add(c.actorTmdbId);
    for (const a of c.actors) if (typeof a.actorTmdbId === "number") actorIdSet.add(a.actorTmdbId);
  }
  const imageMap = new Map<number, string | null>();
  if (actorIdSet.size > 0) {
    const celebs = await prisma.celebrity.findMany({
      where: { tmdbId: { in: Array.from(actorIdSet) } },
      select: { tmdbId: true, profilePath: true },
    });
    for (const c of celebs) {
      imageMap.set(c.tmdbId, c.profilePath ? posterUrl(c.profilePath, "w185") : null);
    }
  }

  type CharData = WatchCompanionData["characters"][number];
  const characters: CharData[] = companion.characters.map((c) => ({
    id: c.id,
    name: c.name,
    actorName: c.actorName,
    actorTmdbId: c.actorTmdbId,
    baseDescription: c.baseDescription,
    group: c.group,
    imageUrl: c.actorTmdbId ? imageMap.get(c.actorTmdbId) ?? null : null,
    seasonNumber: c.seasonNumber,
    visibleAfter: c.visibleAfter as CharData["visibleAfter"],
    facts: c.facts.map((f) => ({ ...f, visibleAfter: f.visibleAfter as CharData["facts"][number]["visibleAfter"] })),
    actors: c.actors.map((a) => ({
      actorName: a.actorName,
      actorTmdbId: a.actorTmdbId,
      note: a.note,
      visibleAfter: a.visibleAfter as CharData["visibleAfter"],
      imageUrl: a.actorTmdbId ? imageMap.get(a.actorTmdbId) ?? null : null,
    })),
    nameAliases: ((c.nameAliases ?? []) as Array<{ name?: string; visibleAfter?: unknown }>)
      .filter((n): n is { name: string; visibleAfter: CharData["visibleAfter"] } => typeof n?.name === "string")
      .map((n) => ({ name: n.name, visibleAfter: (n.visibleAfter ?? {}) as CharData["visibleAfter"] })),
    groupHistory: ((c.groupHistory ?? []) as Array<{ group?: string; visibleAfter?: unknown }>)
      .filter((g): g is { group: string; visibleAfter: CharData["visibleAfter"] } => typeof g?.group === "string" && g.group.length > 0)
      .map((g) => ({ group: g.group, visibleAfter: (g.visibleAfter ?? {}) as CharData["visibleAfter"] })),
  }));

  const approvedSuggestions = await prisma.companionSuggestion.findMany({
    where: { companionId: companion.id, status: { in: ["approved"] } },
    select: { targetType: true, targetId: true, appliedItemId: true },
  });
  const communityItemIds = new Set<string>();
  for (const s of approvedSuggestions) {
    if (s.targetId) communityItemIds.add(`${s.targetType}:${s.targetId}`);
    if (s.appliedItemId) communityItemIds.add(`${s.targetType}:${s.appliedItemId}`);
  }

  // Recap shape mirrors the inline parser on the movie page.
  const recapBlob = (companion.recaps && typeof companion.recaps === "object" && !Array.isArray(companion.recaps))
    ? (companion.recaps as { current?: { installment?: unknown; series?: unknown; text?: unknown } })
    : null;
  const movieRecap = recapBlob?.current
    ? {
        installment: typeof recapBlob.current.installment === "string"
          ? recapBlob.current.installment
          : typeof recapBlob.current.text === "string"
            ? recapBlob.current.text
            : "",
        series: typeof recapBlob.current.series === "string" ? recapBlob.current.series : null,
      }
    : null;

  return {
    id: companion.id,
    tmdbId: companion.tmdbId,
    title: companion.title,
    mediaType: "movie",
    runtimeSeconds: companion.runtimeSeconds,
    seasonsGenerated: companion.seasonsGenerated,
    communityItemIds: Array.from(communityItemIds),
    characters,
    relationships: companion.relationships.map((r) => ({
      ...r,
      seasonNumber: r.seasonNumber,
      visibleAfter: r.visibleAfter as WatchCompanionData["relationships"][number]["visibleAfter"],
    })),
    timeline: companion.timeline.map((t) => ({
      ...t,
      seasonNumber: t.seasonNumber,
      visibleAfter: t.visibleAfter as WatchCompanionData["timeline"][number]["visibleAfter"],
    })),
    glossary: companion.glossary.map((g) => ({
      ...g,
      seasonNumber: g.seasonNumber,
      visibleAfter: g.visibleAfter as WatchCompanionData["glossary"][number]["visibleAfter"],
    })),
    recaps: movieRecap && (movieRecap.installment.length > 0 || movieRecap.series)
      ? { movie: { installment: movieRecap.installment, series: movieRecap.series } }
      : undefined,
  };
}
