/**
 * Backfill recap content for every published WatchCompanion that's
 * missing it. Each companion produces an installment recap (always)
 * and a series recap (when there are prior installments).
 *
 * Movies: one slot per companion at recaps.current.
 * TV: one slot per generated season, keyed by season number; we
 *     iterate seasonsGenerated in ascending order so the series block
 *     for S2+ sees S1's installment text already populated.
 *
 * Skip-already-populated logic: a season/movie slot is considered
 * complete when it has an installment text. The series block is
 * regenerated only when missing AND there's at least one prior
 * installment to compress.
 *
 * Run with:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-companion-recaps.ts                # dry run
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-companion-recaps.ts --commit       # write changes
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-companion-recaps.ts --redo-series  # also redraft series blocks that resolved to null under the old "skip if no priors found" logic — now that we gap-fill from training data, S2+ and franchise sequels should always have a non-null series recap.
 *
 * --redo-series only redrafts the series block. Existing installment
 * text is preserved so manual edits aren't clobbered.
 *
 * Subtitles are intentionally not fetched here — the recap chunk reads
 * TMDB overview + Wikipedia + episode summaries + the persisted
 * timeline events, and skipping subs avoids burning OpenSubtitles
 * quota on a backfill run that doesn't need them.
 */

import { prisma } from "../lib/prisma";
import { getAnthropic } from "../lib/ai/client";
import { draftRecap, draftSeriesRecap, type PriorRecapEntry, type PriorMissingEntry } from "../lib/ai/watch-companion-chunks/recap";
import { fetchWikipediaPage, fetchWikipediaEpisodeList, type CompanionGroundingData } from "../lib/ai/watch-companion-grounding";
import { getMovieDetails, getShowDetails, getCollectionDetails, type TMDBMovie, type TMDBShow } from "../lib/tmdb";
import type { DraftTimelineEvent } from "../lib/ai/watch-companion-chunks/shared";

const COMMIT = process.argv.includes("--commit");
const REDO_SERIES = process.argv.includes("--redo-series");
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

interface SlotPlan {
  companionId: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  // For TV, the season number being filled. Null for movies.
  season: number | null;
  // What needs to be drafted. Both true for the most common case.
  needsInstallment: boolean;
  needsSeries: boolean;
  // True when this is the first installment in the series — series
  // block is skipped (it'd just duplicate the installment).
  hasPriors: boolean;
}

// Crude token estimator. 4 chars ≈ 1 token, close enough for a cost ballpark.
function estimateTokens(s: string): number { return Math.ceil(s.length / 4); }

async function fetchSeasonEpisodes(tmdbId: number, seasonNumber: number) {
  if (!TMDB_API_KEY) return [];
  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=en-US`,
    );
    if (!res.ok) return [];
    const data = await res.json() as { episodes?: Array<{ episode_number: number; name: string; overview: string; runtime: number | null; air_date: string | null }> };
    return (data.episodes ?? []).map((e) => ({
      episodeNumber: e.episode_number,
      name: e.name,
      overview: e.overview,
      runtime: e.runtime,
      airDate: e.air_date ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Build a slim grounding for a single recap call. Skips subtitle fetch
 * — the recap chunk doesn't read subtitle excerpts, just TMDB +
 * Wikipedia + the timeline beats we feed in separately.
 */
async function buildSlimGroundingForMovie(tmdbId: number): Promise<CompanionGroundingData> {
  const tmdb = await getMovieDetails(tmdbId);
  const year = tmdb.release_date ? parseInt(tmdb.release_date.slice(0, 4), 10) : null;
  const wiki = await fetchWikipediaPage(tmdb.title, year, "movie");
  return {
    source: "movie",
    title: tmdb.title,
    year,
    runtimeSeconds: tmdb.runtime ? tmdb.runtime * 60 : null,
    overview: tmdb.overview ?? "",
    wikipedia: wiki,
    wikipediaEpisodes: null,
    tmdb,
    cast: [],
    subtitleExcerpts: [],
    subtitleStatuses: [],
  };
}

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
  const targetSeason = seasons.find((s) => s.seasonNumber === seasonNumber);
  if (targetSeason) {
    targetSeason.episodes = await fetchSeasonEpisodes(tmdbId, seasonNumber);
  }
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

/**
 * Build the prior-installment context for the series-recap chunk —
 * mirroring `loadPriorContext` in watch-companion-generate.ts.
 *
 * Returns two lists:
 *   - stored:  prior installments that already have an INSTALLMENT
 *              recap drafted (full text — source of truth).
 *   - missing: prior installments that don't have a recap yet
 *              (label + TMDB overview — AI fills from training data).
 *
 * Without `missing` the series block silently skips installments
 * generated out of order (e.g. backfilling S5 when S2/3/4 don't exist).
 */
async function loadTvPriorContext(
  companionId: string,
  currentSeason: number,
  grounding: CompanionGroundingData,
): Promise<{ stored: PriorRecapEntry[]; missing: PriorMissingEntry[] }> {
  const c = await prisma.watchCompanion.findUnique({
    where: { id: companionId },
    select: { recaps: true },
  });
  const blob = (c?.recaps && typeof c.recaps === "object" && !Array.isArray(c.recaps))
    ? (c.recaps as Record<string, unknown>)
    : {};
  const seasonOverviews = grounding.source === "tv" ? (grounding.seasons ?? []) : [];

  const stored: PriorRecapEntry[] = [];
  const missing: PriorMissingEntry[] = [];
  for (let n = 1; n < currentSeason; n++) {
    const slot = blob[String(n)];
    const inst = slot && typeof slot === "object" && !Array.isArray(slot)
      ? (slot as { installment?: unknown }).installment
      : undefined;
    if (typeof inst === "string" && inst.length > 0) {
      stored.push({ label: `Season ${n}`, text: inst });
    } else {
      const info = seasonOverviews.find((s) => s.seasonNumber === n);
      missing.push({
        label: `Season ${n}`,
        tmdbOverview: info?.overview ?? null,
        year: null,
      });
    }
  }
  return { stored, missing };
}

async function loadMoviePriorContext(
  tmdbId: number,
  currentTmdb: TMDBMovie,
): Promise<{ stored: PriorRecapEntry[]; missing: PriorMissingEntry[] }> {
  const collectionId = currentTmdb.belongs_to_collection?.id;
  if (!collectionId) return { stored: [], missing: [] };
  try {
    const collection = await getCollectionDetails(collectionId);
    const targetDate = currentTmdb.release_date ? new Date(currentTmdb.release_date) : null;
    const earlierParts = (collection.parts ?? [])
      .filter((p) => p.id !== tmdbId)
      .filter((p) => {
        if (!targetDate || !p.release_date) return false;
        return new Date(p.release_date).getTime() < targetDate.getTime();
      })
      .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
    if (earlierParts.length === 0) return { stored: [], missing: [] };

    const partIds = earlierParts.map((p) => p.id);
    const companions = await prisma.watchCompanion.findMany({
      where: { mediaType: "movie", status: "published", tmdbId: { in: partIds } },
      select: { tmdbId: true, recaps: true },
    });
    const byTmdb = new Map<number, { recaps: unknown }>();
    for (const c of companions) byTmdb.set(c.tmdbId, c);

    const stored: PriorRecapEntry[] = [];
    const missing: PriorMissingEntry[] = [];
    for (const part of earlierParts) {
      const yearStr = part.release_date ? part.release_date.slice(0, 4) : null;
      const year = yearStr ? Number(yearStr) : null;
      const yearSuffix = yearStr ? ` (${yearStr})` : "";
      const label = `${part.title}${yearSuffix}`;

      const c = byTmdb.get(part.id);
      const blob = (c?.recaps && typeof c.recaps === "object" && !Array.isArray(c.recaps))
        ? (c.recaps as { current?: { installment?: unknown; text?: unknown } })
        : null;
      const inst = blob?.current?.installment ?? blob?.current?.text;
      if (typeof inst === "string" && inst.length > 0) {
        stored.push({ label, text: inst });
      } else {
        missing.push({
          label: part.title,
          tmdbOverview: part.overview ?? null,
          year: Number.isFinite(year ?? NaN) ? year : null,
        });
      }
    }
    return { stored, missing };
  } catch {
    return { stored: [], missing: [] };
  }
}

async function loadTimelineEvents(companionId: string, season: number | null): Promise<DraftTimelineEvent[]> {
  const rows = await prisma.companionTimelineEvent.findMany({
    where: { companionId, ...(season !== null ? { seasonNumber: season } : {}) },
    select: { description: true, characterIds: true, importance: true, visibleAfter: true },
  });
  // Resolve characterIds → characterNames so the recap prompt sees
  // names instead of opaque cuid hashes. The chunk technically doesn't
  // use this field but DraftTimelineEvent's shape requires it.
  const allCharIds = Array.from(new Set(rows.flatMap((r) => r.characterIds)));
  const chars = allCharIds.length > 0
    ? await prisma.companionCharacter.findMany({
        where: { id: { in: allCharIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map<string, string>();
  for (const c of chars) nameById.set(c.id, c.name);
  return rows.map((r) => ({
    description: r.description,
    characterNames: r.characterIds.map((id) => nameById.get(id) ?? "(unknown)"),
    importance: r.importance,
    visibleAfter: r.visibleAfter as DraftTimelineEvent["visibleAfter"],
  }));
}

async function planAll(): Promise<SlotPlan[]> {
  const companions = await prisma.watchCompanion.findMany({
    where: { status: "published" },
    select: {
      id: true, tmdbId: true, mediaType: true, title: true,
      seasonsGenerated: true, recaps: true,
    },
  });
  const plans: SlotPlan[] = [];
  for (const c of companions) {
    const blob = (c.recaps && typeof c.recaps === "object" && !Array.isArray(c.recaps))
      ? (c.recaps as Record<string, unknown>)
      : null;
    // "Attempted" = the property exists on the slot, even if its
    // value is null. The exec path always writes series (null for
    // standalones / first installments), so this property check lets
    // the script idempotently re-run without re-attempting series for
    // movies that genuinely have no franchise siblings.
    const has = (obj: Record<string, unknown> | null | undefined, key: string) =>
      !!obj && Object.prototype.hasOwnProperty.call(obj, key);

    if (c.mediaType === "movie") {
      const current = blob?.current && typeof blob.current === "object" && !Array.isArray(blob.current)
        ? (blob.current as Record<string, unknown>)
        : null;
      const hasInstallmentText = typeof current?.installment === "string" && (current.installment as string).length > 0
        || typeof current?.text === "string" && (current.text as string).length > 0;
      const seriesAttempted = has(current, "series");
      const seriesIsNull = seriesAttempted && current?.series === null;
      // --redo-series re-tries any movie slot whose series ended up null.
      // It might still resolve to null at exec time (standalone, not in a
      // collection) — exec handles that gracefully.
      const wantsSeriesRedo = REDO_SERIES && hasInstallmentText && seriesIsNull;
      if (!hasInstallmentText || !seriesAttempted || wantsSeriesRedo) {
        plans.push({
          companionId: c.id,
          tmdbId: c.tmdbId,
          mediaType: "movie",
          title: c.title,
          season: null,
          needsInstallment: !hasInstallmentText,
          needsSeries: !seriesAttempted || wantsSeriesRedo,
          hasPriors: false, // resolved at exec time
        });
      }
    } else {
      const seasons = [...c.seasonsGenerated].sort((a, b) => a - b);
      for (const s of seasons) {
        const slot = blob?.[String(s)] && typeof blob[String(s)] === "object" && !Array.isArray(blob[String(s)])
          ? (blob[String(s)] as Record<string, unknown>)
          : null;
        const hasInstallmentText = typeof slot?.installment === "string" && (slot.installment as string).length > 0;
        const seriesAttempted = has(slot, "series");
        const seriesIsNull = seriesAttempted && slot?.series === null;
        const isFirstSeason = s === 1;
        // --redo-series re-tries S2+ where series resolved to null under
        // the old "skip if no priors found" logic — now they should always
        // produce non-null series via the missing-installment gap-fill.
        const wantsSeriesRedo = REDO_SERIES && hasInstallmentText && seriesIsNull && !isFirstSeason;
        // First seasons skip the series block by definition. For S2+,
        // attempt if the property is missing entirely OR if we want a redo.
        if (!hasInstallmentText || (!seriesAttempted && !isFirstSeason) || wantsSeriesRedo) {
          plans.push({
            companionId: c.id,
            tmdbId: c.tmdbId,
            mediaType: "tv",
            title: c.title,
            season: s,
            needsInstallment: !hasInstallmentText,
            needsSeries: (!seriesAttempted && !isFirstSeason) || wantsSeriesRedo,
            hasPriors: !isFirstSeason,
          });
        }
      }
    }
  }
  return plans;
}

async function execPlan(plan: SlotPlan): Promise<{ ok: boolean; reason?: string }> {
  const client = getAnthropic();
  // Build slim grounding (no subtitles).
  const grounding = plan.mediaType === "movie"
    ? await buildSlimGroundingForMovie(plan.tmdbId)
    : await buildSlimGroundingForShow(plan.tmdbId, plan.season!);

  // Read the existing slot up front so we can preserve installment text
  // when only the series block is being redrafted (--redo-series path).
  const existing = await prisma.watchCompanion.findUnique({
    where: { id: plan.companionId },
    select: { recaps: true },
  });
  const blob = (existing?.recaps && typeof existing.recaps === "object" && !Array.isArray(existing.recaps))
    ? { ...(existing.recaps as Record<string, unknown>) }
    : {};
  const existingSlot = plan.mediaType === "movie"
    ? (blob.current && typeof blob.current === "object" && !Array.isArray(blob.current) ? blob.current as Record<string, unknown> : null)
    : (blob[String(plan.season)] && typeof blob[String(plan.season)] === "object" && !Array.isArray(blob[String(plan.season)]) ? blob[String(plan.season)] as Record<string, unknown> : null);
  const existingInstallment = typeof existingSlot?.installment === "string" ? existingSlot.installment as string : null;

  let installmentText: string;
  let seriesText: string | null;

  if (plan.needsInstallment) {
    // Full draft — both blocks. Loads priors + drafts installment + series.
    const timeline = await loadTimelineEvents(plan.companionId, plan.season);
    const { stored, missing } = plan.mediaType === "movie"
      ? await loadMoviePriorContext(plan.tmdbId, grounding.tmdb as TMDBMovie)
      : await loadTvPriorContext(plan.companionId, plan.season!, grounding);
    const result = await draftRecap(client, grounding, plan.season, timeline, stored, missing);
    installmentText = result.installment;
    seriesText = result.series;
  } else if (plan.needsSeries) {
    // Series-only redo. Reuse the persisted installment text (could be
    // an admin-edited version) and only redraft the series block.
    if (!existingInstallment) {
      return { ok: false, reason: "needsSeries but no existing installment text to anchor against" };
    }
    installmentText = existingInstallment;
    const { stored, missing } = plan.mediaType === "movie"
      ? await loadMoviePriorContext(plan.tmdbId, grounding.tmdb as TMDBMovie)
      : await loadTvPriorContext(plan.companionId, plan.season!, grounding);
    if (stored.length === 0 && missing.length === 0) {
      // Standalone or S1 — no priors. Series stays null.
      seriesText = null;
    } else {
      const isMovie = plan.mediaType === "movie";
      const installmentLabel = isMovie
        ? `${plan.title}${(grounding.tmdb as TMDBMovie).release_date ? ` (${(grounding.tmdb as TMDBMovie).release_date.slice(0, 4)})` : ""}`
        : `${plan.title} — Season ${plan.season}`;
      seriesText = await draftSeriesRecap(client, installmentLabel, installmentText, stored, missing);
    }
  } else {
    return { ok: false, reason: "neither installment nor series flagged" };
  }

  if (plan.mediaType === "movie") {
    const tmdb = grounding.tmdb as TMDBMovie;
    const year = tmdb.release_date ? parseInt(tmdb.release_date.slice(0, 4), 10) : null;
    blob.current = {
      title: plan.title,
      year: Number.isFinite(year ?? NaN) ? year : null,
      installment: installmentText,
      series: seriesText,
    };
  } else {
    blob[String(plan.season)] = {
      installment: installmentText,
      series: seriesText,
    };
  }
  if (COMMIT) {
    await prisma.watchCompanion.update({
      where: { id: plan.companionId },
      data: { recaps: blob as unknown as object },
    });
  }
  return { ok: true };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Did you pass --env-file=.env.local?");
    process.exit(1);
  }
  if (!TMDB_API_KEY) {
    console.error("TMDB_API_KEY not set. Did you pass --env-file=.env?");
    process.exit(1);
  }

  console.log(`Scanning published companions for missing recap content…`);
  const plans = await planAll();
  console.log(`${plans.length} slot(s) need backfill.`);
  if (plans.length === 0) return;

  // Group by companion for the dry-run summary.
  const byCompanion = new Map<string, SlotPlan[]>();
  for (const p of plans) {
    const list = byCompanion.get(p.companionId) ?? [];
    list.push(p);
    byCompanion.set(p.companionId, list);
  }
  for (const [, list] of byCompanion) {
    const head = list[0];
    const lines = list.map((p) => {
      const what: string[] = [];
      if (p.needsInstallment) what.push("installment");
      if (p.needsSeries) what.push("series");
      const where = p.season !== null ? ` S${p.season}` : "";
      return `  -${where} ${what.join(" + ")}`;
    }).join("\n");
    console.log(`\n${head.title} (${head.mediaType})\n${lines}`);
  }

  // Cost estimate: ~1.5 Sonnet calls per plan on average (some have
  // both blocks, some only installment, some only series). Assume
  // 1500 in / 400 out per call → Sonnet 4.6 pricing roughly $3/Mtok
  // input, $15/Mtok output. Rough but useful for sanity.
  const callsPerPlan = plans.reduce((acc, p) => acc + (p.needsInstallment ? 1 : 0) + (p.needsSeries ? 1 : 0), 0);
  const inTokGuess = callsPerPlan * 1500;
  const outTokGuess = callsPerPlan * 400;
  const cost = (inTokGuess / 1_000_000) * 3 + (outTokGuess / 1_000_000) * 15;
  console.log(`\n~${callsPerPlan} Sonnet 4.6 call(s) total.`);
  console.log(`Rough cost: ~$${cost.toFixed(2)}.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to actually generate and persist.");
    return;
  }

  console.log("\nExecuting…");
  let done = 0;
  let failed = 0;
  for (const plan of plans) {
    const label = plan.mediaType === "movie"
      ? plan.title
      : `${plan.title} S${plan.season}`;
    try {
      const res = await execPlan(plan);
      if (res.ok) {
        done++;
        console.log(`[${done}/${plans.length}] ${label} — ok`);
      } else {
        failed++;
        console.error(`[${done + failed}/${plans.length}] ${label} — SKIPPED: ${res.reason ?? "unknown reason"}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${done + failed}/${plans.length}] ${label} — FAILED: ${msg}`);
    }
  }
  console.log(`\nDone. Updated ${done}, failed ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
