/**
 * awards-sync.ts
 *
 * Orchestrates fetching awards data from Wikidata and writing it to the database.
 * Supports both on-demand sync (triggered by page visits) and bulk import.
 */

import { prisma } from "@/lib/prisma";
import {
  fetchMovieAwards,
  fetchPersonAwards,
  fetchTVShowAwards,
  identifyAwardBody,
  type WikidataAwardResult,
} from "@/lib/wikidata";

const SYNC_STALE_DAYS = 30;

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build a deterministic dedup key for an award nomination */
function buildDedupKey(parts: {
  categoryId: string;
  year: number | null;
  movieId?: string | null;
  tvShowId?: string | null;
  celebrityId?: string | null;
  forMovieId?: string | null;
  forTvShowId?: string | null;
}): string {
  return [
    parts.categoryId,
    parts.year ?? 0,
    parts.movieId ?? "",
    parts.tvShowId ?? "",
    parts.celebrityId ?? "",
    parts.forMovieId ?? "",
    parts.forTvShowId ?? "",
  ].join("|");
}

async function isSyncFresh(entityType: string, entityId: string): Promise<boolean> {
  const log = await prisma.awardsSyncLog.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });
  if (!log) return false;
  const ageMs = Date.now() - log.syncedAt.getTime();
  return ageMs < SYNC_STALE_DAYS * 24 * 60 * 60 * 1000;
}

async function markSynced(entityType: string, entityId: string): Promise<void> {
  await prisma.awardsSyncLog.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, syncedAt: new Date() },
    update: { syncedAt: new Date() },
  });
}

/** Find or create an AwardBody + AwardCategory and return the category ID */
async function ensureCategory(
  bodySlug: string,
  bodyName: string,
  bodyShortName: string,
  categoryLabel: string,
  wikidataId: string | null
): Promise<string> {
  const body = await prisma.awardBody.upsert({
    where: { slug: bodySlug },
    create: { slug: bodySlug, name: bodyName, shortName: bodyShortName },
    update: {},
    select: { id: true },
  });

  const catSlug = slugify(categoryLabel);

  const category = await prisma.awardCategory.upsert({
    where: { awardBodyId_slug: { awardBodyId: body.id, slug: catSlug } },
    create: {
      awardBodyId: body.id,
      slug: catSlug,
      name: categoryLabel,
      wikidataId,
    },
    update: {},
    select: { id: true },
  });

  return category.id;
}

// ─── Movie awards sync ──────────────────────────────────────────────────────

export async function syncMovieAwards(
  movieId: string,
  tmdbId: number,
  imdbId?: string | null
): Promise<number> {
  if (await isSyncFresh("movie", movieId)) return 0;

  let results: WikidataAwardResult[];
  try {
    results = await fetchMovieAwards(tmdbId, imdbId);
  } catch (e) {
    console.error(`[awards-sync] Failed to fetch movie awards for tmdb:${tmdbId}:`, e);
    return 0;
  }

  let count = 0;
  for (const award of results) {
    const body = identifyAwardBody(award.categoryLabel, award.awardWikidataId);
    if (!body) continue;

    try {
      const categoryId = await ensureCategory(
        body.slug, body.name, body.shortName,
        award.categoryLabel, award.awardWikidataId
      );

      let celebrityId: string | null = null;
      if (award.personTmdbId) {
        const celeb = await prisma.celebrity.findUnique({
          where: { tmdbId: award.personTmdbId },
          select: { id: true },
        });
        celebrityId = celeb?.id ?? null;
      }

      const dedupKey = buildDedupKey({
        categoryId, year: award.year, movieId, celebrityId,
      });

      await prisma.awardNomination.upsert({
        where: { dedupKey },
        create: {
          dedupKey,
          categoryId,
          isWinner: award.isWinner,
          year: award.year,
          ceremony: award.ceremonyLabel,
          movieId,
          celebrityId,
          wikidataId: award.awardWikidataId,
        },
        update: {
          isWinner: award.isWinner,
          ceremony: award.ceremonyLabel,
        },
      });
      count++;
    } catch (e) {
      console.error(`[awards-sync] Skipping award "${award.categoryLabel}":`, e);
    }
  }

  if (count > 0) await markSynced("movie", movieId);
  return count;
}

// ─── Celebrity awards sync ──────────────────────────────────────────────────

export async function syncCelebrityAwards(
  celebrityId: string,
  tmdbId: number,
  imdbId?: string | null
): Promise<number> {
  if (await isSyncFresh("celebrity", celebrityId)) return 0;

  let results: WikidataAwardResult[];
  try {
    results = await fetchPersonAwards(tmdbId, imdbId);
  } catch (e) {
    console.error(`[awards-sync] Failed to fetch person awards for tmdb:${tmdbId}:`, e);
    return 0;
  }

  let count = 0;
  for (const award of results) {
    const body = identifyAwardBody(award.categoryLabel, award.awardWikidataId);
    if (!body) continue;

    try {
      const categoryId = await ensureCategory(
        body.slug, body.name, body.shortName,
        award.categoryLabel, award.awardWikidataId
      );

      let forMovieId: string | null = null;
      if (award.forWorkTmdbId) {
        const movie = await prisma.movie.findUnique({
          where: { tmdbId: award.forWorkTmdbId },
          select: { id: true },
        });
        forMovieId = movie?.id ?? null;
      }

      const dedupKey = buildDedupKey({
        categoryId, year: award.year, celebrityId, forMovieId,
      });

      await prisma.awardNomination.upsert({
        where: { dedupKey },
        create: {
          dedupKey,
          categoryId,
          isWinner: award.isWinner,
          year: award.year,
          ceremony: award.ceremonyLabel,
          celebrityId,
          forMovieId,
          wikidataId: award.awardWikidataId,
        },
        update: {
          isWinner: award.isWinner,
          ceremony: award.ceremonyLabel,
        },
      });
      count++;
    } catch (e) {
      console.error(`[awards-sync] Skipping award "${award.categoryLabel}":`, e);
    }
  }

  if (count > 0) await markSynced("celebrity", celebrityId);
  return count;
}

// ─── TV show awards sync ────────────────────────────────────────────────────

export async function syncTVShowAwards(
  tvShowId: string,
  imdbId: string
): Promise<number> {
  if (await isSyncFresh("tvshow", tvShowId)) return 0;

  let results: WikidataAwardResult[];
  try {
    results = await fetchTVShowAwards(imdbId);
  } catch (e) {
    console.error(`[awards-sync] Failed to fetch TV show awards for imdb:${imdbId}:`, e);
    return 0;
  }

  let count = 0;
  for (const award of results) {
    const body = identifyAwardBody(award.categoryLabel, award.awardWikidataId);
    if (!body) continue;

    try {
      const categoryId = await ensureCategory(
        body.slug, body.name, body.shortName,
        award.categoryLabel, award.awardWikidataId
      );

      let celebrityId: string | null = null;
      if (award.personTmdbId) {
        const celeb = await prisma.celebrity.findUnique({
          where: { tmdbId: award.personTmdbId },
          select: { id: true },
        });
        celebrityId = celeb?.id ?? null;
      }

      const dedupKey = buildDedupKey({
        categoryId, year: award.year, tvShowId, celebrityId,
      });

      await prisma.awardNomination.upsert({
        where: { dedupKey },
        create: {
          dedupKey,
          categoryId,
          isWinner: award.isWinner,
          year: award.year,
          ceremony: award.ceremonyLabel,
          tvShowId,
          celebrityId,
          wikidataId: award.awardWikidataId,
        },
        update: {
          isWinner: award.isWinner,
          ceremony: award.ceremonyLabel,
        },
      });
      count++;
    } catch (e) {
      console.error(`[awards-sync] Skipping award "${award.categoryLabel}":`, e);
    }
  }

  if (count > 0) await markSynced("tvshow", tvShowId);
  return count;
}
