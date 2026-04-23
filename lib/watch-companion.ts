// Shared helpers for the Watch Companion viewer. Handles spoiler filtering
// against a user's current watch position.

import { prisma } from "@/lib/prisma";

export interface VisibleAfter {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

export interface WatchPosition {
  seconds?: number | null;  // for movies
  season?: number | null;   // for shows
  episode?: number | null;  // for shows
}

/**
 * Returns true if the viewer's current position has progressed past the point
 * where this content was revealed. The "unknown" case (missing fields) is
 * handled conservatively: content with no visibleAfter marker is assumed
 * always visible (start of the story).
 */
export function isVisible(visibleAfter: VisibleAfter | null | undefined, position: WatchPosition, mediaType: "movie" | "tv"): boolean {
  if (!visibleAfter) return true;

  if (mediaType === "movie") {
    const threshold = visibleAfter.seconds ?? 0;
    const current = position.seconds ?? 0;
    return current >= threshold;
  }

  // TV: season/episode comparison with seconds as tiebreaker
  const thSeason = visibleAfter.season ?? 1;
  const thEpisode = visibleAfter.episode ?? 1;
  const thSeconds = visibleAfter.seconds ?? 0;
  const curSeason = position.season ?? 1;
  const curEpisode = position.episode ?? 1;
  const curSeconds = position.seconds ?? Number.MAX_SAFE_INTEGER;

  if (curSeason > thSeason) return true;
  if (curSeason < thSeason) return false;
  if (curEpisode > thEpisode) return true;
  if (curEpisode < thEpisode) return false;
  return curSeconds >= thSeconds;
}

/**
 * Load the published companion for a movie or show by TMDB ID. Returns null
 * if no published companion exists.
 */
export async function getPublishedCompanion(tmdbId: number, mediaType: "movie" | "tv") {
  return prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
    include: {
      characters: {
        include: { facts: true },
        orderBy: { sortOrder: "asc" },
      },
      relationships: true,
      timeline: true,
      glossary: true,
    },
  }).then((c) => (c && c.status === "published" ? c : null));
}

/**
 * A simple position for "show me everything by default" before a user picks
 * a slider position. For movies, clamp to the end of runtime. For shows,
 * advance through all generated seasons.
 */
export function maxPosition(companion: { mediaType: string; runtimeSeconds: number | null; seasonsGenerated: number[] }): WatchPosition {
  if (companion.mediaType === "movie") {
    return { seconds: companion.runtimeSeconds ?? Number.MAX_SAFE_INTEGER };
  }
  const lastSeason = companion.seasonsGenerated[companion.seasonsGenerated.length - 1] ?? 1;
  return { season: lastSeason, episode: 99 };
}

/**
 * Default starting position for a fresh pageload — a conservative "I haven't
 * watched anything yet" state that hides everything except content tagged at
 * the start.
 */
export function startPosition(mediaType: "movie" | "tv"): WatchPosition {
  if (mediaType === "movie") return { seconds: 0 };
  return { season: 1, episode: 1, seconds: 0 };
}
