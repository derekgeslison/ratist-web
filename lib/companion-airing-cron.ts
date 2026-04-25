import { prisma } from "@/lib/prisma";
import { getAnthropic } from "@/lib/ai/client";
import { generateCompanionStream, loadPriorContext } from "@/lib/ai/watch-companion-generate";
import { fetchWikipediaPage, fetchWikipediaEpisodeList, type CompanionGroundingData } from "@/lib/ai/watch-companion-grounding";
import { draftRecap } from "@/lib/ai/watch-companion-chunks/recap";
import type { DraftTimelineEvent } from "@/lib/ai/watch-companion-chunks/shared";
import { getShowDetails } from "@/lib/tmdb";
import { getSeasonAiringStatus, AIRING_BUFFER_DAYS } from "@/lib/companion-airing";
import { notifyFollowersOfNewEpisode, notifyFollowersOfSeasonFinalized } from "@/lib/watch-companion-notify";

// Hard ceiling on consecutive failures before the cron stops attempting a
// row this sweep. Admins see failureCount + lastError on the row in the
// admin UI and can manually reset by re-running generation. Without this
// cap, a season with broken TMDB data would burn Anthropic quota daily
// trying the same impossible episode.
const MAX_FAILURES = 5;

// Per-row sweep budget. With 5 sequential ~2-min episode gens this would
// blow Vercel's 300s ceiling — so the sweep processes at most this many
// new episodes per row per run. Remaining episodes get picked up next
// sweep. Real-world cadence (one new episode per week) means this almost
// never bites.
const MAX_EPISODES_PER_ROW_PER_SWEEP = 2;

export interface SweepRowResult {
  companionId: string;
  seasonNumber: number;
  episodesGeneratedThisSweep: number[];
  finalized: boolean;
  failureCount: number;
  lastError: string | null;
  skipped?: "max_failures" | "missing_companion" | "no_generator";
}

export interface SweepResult {
  rowsScanned: number;
  rowsProcessed: number;
  rowsFinalized: number;
  totalEpisodesGenerated: number;
  rows: SweepRowResult[];
}

/**
 * Runs one cron pass over every CompanionAiringSeason row in airing
 * status. For each row:
 *   1. Determine which episodes are newly eligible (air_date + 2 days
 *      <= today AND not yet in episodesGenerated).
 *   2. Generate each new episode via the per-episode pipeline (capped
 *      per row per sweep). Failures bump failureCount and stop further
 *      processing for that row this sweep.
 *   3. If the season is no longer airing (last_episode + 2 days has
 *      passed) AND every announced episode is generated, finalize:
 *      run the recap chunks, push the season into seasonsGenerated,
 *      flip status to 'completed'.
 */
export async function runAiringSweep(now: Date = new Date()): Promise<SweepResult> {
  const airingRows = await prisma.companionAiringSeason.findMany({
    where: { status: "airing" },
    include: {
      companion: {
        select: { id: true, tmdbId: true, mediaType: true, generatedBy: true, seasonsGenerated: true, recaps: true, title: true },
      },
    },
  });

  const result: SweepResult = {
    rowsScanned: airingRows.length,
    rowsProcessed: 0,
    rowsFinalized: 0,
    totalEpisodesGenerated: 0,
    rows: [],
  };

  for (const row of airingRows) {
    const companion = row.companion;
    if (!companion || companion.mediaType !== "tv") {
      result.rows.push({
        companionId: row.companionId,
        seasonNumber: row.seasonNumber,
        episodesGeneratedThisSweep: [],
        finalized: false,
        failureCount: row.failureCount,
        lastError: row.lastError,
        skipped: "missing_companion",
      });
      continue;
    }

    if (row.failureCount >= MAX_FAILURES) {
      result.rows.push({
        companionId: row.companionId,
        seasonNumber: row.seasonNumber,
        episodesGeneratedThisSweep: [],
        finalized: false,
        failureCount: row.failureCount,
        lastError: row.lastError,
        skipped: "max_failures",
      });
      continue;
    }

    if (!companion.generatedBy) {
      // Episode-mode persist requires a generatedByUserId for audit trail.
      // If the original generator user has been deleted, skip the row —
      // an admin can reassign by manually generating the next episode.
      result.rows.push({
        companionId: row.companionId,
        seasonNumber: row.seasonNumber,
        episodesGeneratedThisSweep: [],
        finalized: false,
        failureCount: row.failureCount,
        lastError: row.lastError,
        skipped: "no_generator",
      });
      continue;
    }

    const status = await getSeasonAiringStatus(companion.tmdbId, row.seasonNumber, now);
    const episodesGeneratedSet = new Set(row.episodesGenerated);
    const newlyEligible = status.eligibleEpisodes
      .filter((ep) => !episodesGeneratedSet.has(ep))
      .sort((a, b) => a - b);

    const toProcess = newlyEligible.slice(0, MAX_EPISODES_PER_ROW_PER_SWEEP);
    const episodesGeneratedThisSweep: number[] = [];

    let failureCount = row.failureCount;
    let lastError: string | null = row.lastError;

    for (const episode of toProcess) {
      const outcome = await generateOneEpisode({
        tmdbId: companion.tmdbId,
        seasonNumber: row.seasonNumber,
        episode,
        generatedByUserId: companion.generatedBy,
      });
      if (outcome.kind === "ok") {
        episodesGeneratedThisSweep.push(episode);
        failureCount = 0;
        lastError = null;
        // Fan out to followers. The original generator is auto-skipped
        // by notify() (recipient === actor short-circuit), so they don't
        // get pinged about their own gen.
        await notifyFollowersOfNewEpisode({
          companionId: companion.id,
          season: row.seasonNumber,
          episode,
          actorId: companion.generatedBy,
        });
      } else {
        failureCount += 1;
        lastError = outcome.message;
        await prisma.companionAiringSeason.update({
          where: { id: row.id },
          data: { failureCount, lastError, lastSweepAt: now },
        });
        // Stop processing further episodes for this row this sweep so a
        // failing episode doesn't block subsequent ones from running on
        // the next sweep — but also doesn't burn quota repeatedly within
        // the same sweep.
        break;
      }
    }

    // Decide whether to finalize. Re-read the row fresh because the
    // episode-mode persist may have updated episodesGenerated.
    const fresh = await prisma.companionAiringSeason.findUnique({ where: { id: row.id } });
    const shouldFinalize = fresh
      && !status.airing
      && status.allEpisodes.length > 0
      && status.allEpisodes.every((ep) => fresh.episodesGenerated.includes(ep));

    let finalized = false;
    if (shouldFinalize && fresh) {
      try {
        await finalizeAiringSeason({
          companionId: companion.id,
          tmdbId: companion.tmdbId,
          seasonNumber: row.seasonNumber,
        });
        finalized = true;
        result.rowsFinalized += 1;
        if (companion.generatedBy) {
          await notifyFollowersOfSeasonFinalized({
            companionId: companion.id,
            season: row.seasonNumber,
            actorId: companion.generatedBy,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Finalization failed for companion ${companion.id} season ${row.seasonNumber}:`, err);
        failureCount += 1;
        lastError = `Finalization failed: ${message}`;
        await prisma.companionAiringSeason.update({
          where: { id: row.id },
          data: { failureCount, lastError, lastSweepAt: now },
        });
      }
    } else {
      // Stamp lastSweepAt even on no-op passes so admins can see liveness.
      await prisma.companionAiringSeason.update({
        where: { id: row.id },
        data: { lastSweepAt: now },
      });
    }

    result.rowsProcessed += 1;
    result.totalEpisodesGenerated += episodesGeneratedThisSweep.length;
    result.rows.push({
      companionId: row.companionId,
      seasonNumber: row.seasonNumber,
      episodesGeneratedThisSweep,
      finalized,
      failureCount,
      lastError,
    });
  }

  return result;
}

interface EpisodeRunInput {
  tmdbId: number;
  seasonNumber: number;
  episode: number;
  generatedByUserId: string;
}

type EpisodeOutcome =
  | { kind: "ok"; companionId: string }
  | { kind: "error"; message: string };

async function generateOneEpisode(input: EpisodeRunInput): Promise<EpisodeOutcome> {
  try {
    let companionId: string | null = null;
    let errorMessage: string | null = null;
    for await (const evt of generateCompanionStream({
      tmdbId: input.tmdbId,
      mediaType: "tv",
      season: input.seasonNumber,
      episode: input.episode,
      generatedByUserId: input.generatedByUserId,
    })) {
      if (evt.kind === "error") {
        errorMessage = evt.message;
        break;
      }
      if (evt.kind === "complete") {
        companionId = evt.result.companionId;
      }
    }
    if (errorMessage) return { kind: "error", message: errorMessage };
    if (!companionId) return { kind: "error", message: "Generator finished without a complete event" };
    return { kind: "ok", companionId };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

interface FinalizeInput {
  companionId: string;
  tmdbId: number;
  seasonNumber: number;
}

/**
 * Season-finalization step. Runs once per (companion, season) when the
 * cron sweep determines the season has finished airing AND every episode
 * has been generated. Mirrors the recap-chunk path of the orchestrator
 * but skips characters/facts/relationships/timeline/glossary (already
 * populated by the per-episode runs that ran across the airing window).
 *
 * Side effects:
 *   - WatchCompanion.recaps[seasonNumber] = { installment, series }
 *   - WatchCompanion.seasonsGenerated += seasonNumber
 *   - CompanionAiringSeason.status = 'completed', lastSweepAt = now
 */
export async function finalizeAiringSeason(input: FinalizeInput): Promise<void> {
  const { companionId, tmdbId, seasonNumber } = input;
  const client = getAnthropic();

  // Slim grounding — just enough for the recap chunk. Subtitles aren't
  // needed (the recap reads timeline events + Wikipedia, not dialogue).
  const grounding = await buildSlimGroundingForShow(tmdbId, seasonNumber);

  // Pull the season's persisted timeline events to feed the recap chunk.
  // The recap uses these as the spine of the installment summary.
  const timelineRows = await prisma.companionTimelineEvent.findMany({
    where: { companionId, seasonNumber },
    include: { /* no relations needed — we map by characterIds */ },
    orderBy: { id: "asc" },
  });
  const characterRows = await prisma.companionCharacter.findMany({
    where: { companionId, seasonNumber },
    select: { id: true, name: true },
  });
  const charNameById = new Map<string, string>();
  for (const c of characterRows) charNameById.set(c.id, c.name);
  const timelineEvents: DraftTimelineEvent[] = timelineRows.map((t) => ({
    description: t.description,
    characterNames: (t.characterIds ?? []).map((id) => charNameById.get(id)).filter((n): n is string => !!n),
    importance: t.importance,
    visibleAfter: (t.visibleAfter as DraftTimelineEvent["visibleAfter"]) ?? {},
  }));

  // Same prior-context shape the orchestrator builds — stored vs missing
  // installments. Without this the series recap would silently skip prior
  // seasons that haven't been generated yet.
  const { stored, missing } = await loadPriorContext(tmdbId, "tv", seasonNumber, grounding);

  const recap = await draftRecap(client, grounding, seasonNumber, timelineEvents, stored, missing);

  // Merge into WatchCompanion. Recap blob shape matches the orchestrator's
  // tv path: { "1": { installment, series }, "2": {...}, ... }
  const companion = await prisma.watchCompanion.findUnique({
    where: { id: companionId },
    select: { recaps: true, seasonsGenerated: true },
  });
  const existingRecaps = (companion?.recaps && typeof companion.recaps === "object" && !Array.isArray(companion.recaps))
    ? (companion.recaps as Record<string, unknown>)
    : {};
  const nextRecaps = {
    ...existingRecaps,
    [String(seasonNumber)]: { installment: recap.installment, series: recap.series },
  };
  const nextSeasonsGenerated = Array.from(new Set([...(companion?.seasonsGenerated ?? []), seasonNumber])).sort((a, b) => a - b);

  await prisma.watchCompanion.update({
    where: { id: companionId },
    data: {
      recaps: nextRecaps as unknown as object,
      seasonsGenerated: nextSeasonsGenerated,
      lastGeneratedAt: new Date(),
    },
  });

  await prisma.companionAiringSeason.update({
    where: { companionId_seasonNumber: { companionId, seasonNumber } },
    data: {
      status: "completed",
      lastSweepAt: new Date(),
      failureCount: 0,
      lastError: null,
    },
  });
}

/**
 * Slim grounding for the recap chunk — TMDB show details + Wikipedia +
 * episode list. No cast lookup, no subtitles. The recap doesn't read
 * those, so skipping them keeps the finalization fast and avoids burning
 * OpenSubtitles quota during a cron pass.
 */
async function buildSlimGroundingForShow(tmdbId: number, seasonNumber: number): Promise<CompanionGroundingData> {
  const tmdb = await getShowDetails(tmdbId);
  const year = tmdb.first_air_date ? parseInt(tmdb.first_air_date.slice(0, 4), 10) : null;
  const wiki = await fetchWikipediaPage(tmdb.name, year, "tv");
  const wikiEps = await fetchWikipediaEpisodeList(tmdb.name, year);
  const seasons = (tmdb.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      episodeCount: s.episode_count ?? 0,
      overview: s.overview ?? null,
      episodes: [] as Array<{ episodeNumber: number; name: string; overview: string | null; runtime: number | null; airDate: string | null }>,
    }));
  return {
    source: "tv",
    title: tmdb.name,
    year,
    runtimeSeconds: null,
    overview: tmdb.overview ?? "",
    wikipedia: wiki,
    wikipediaEpisodes: wikiEps,
    tmdb,
    cast: [],
    seasons,
    subtitleExcerpts: [],
    subtitleStatuses: [],
  };
}

// Re-export the buffer constant so callers reading sweep status know the
// rule the system runs on (used by route handlers that surface admin diag
// info, and by tests that fake "today" for sweep behavior).
export { AIRING_BUFFER_DAYS };
