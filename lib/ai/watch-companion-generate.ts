import { prisma } from "@/lib/prisma";
import { getAnthropic } from "./client";
import { getMovieDetails, getCollectionDetails, type TMDBMovie } from "@/lib/tmdb";
import { loadGroundingForMovie, loadGroundingForShow, loadGroundingForEpisode, type CompanionGroundingData } from "./watch-companion-grounding";
import { draftCharacters } from "./watch-companion-chunks/characters";
import { draftFacts } from "./watch-companion-chunks/facts";
import { draftRelationships } from "./watch-companion-chunks/relationships";
import { draftTimeline } from "./watch-companion-chunks/timeline";
import { draftGlossary } from "./watch-companion-chunks/glossary";
import { draftRecap, type PriorRecapEntry, type PriorMissingEntry, type RecapResult } from "./watch-companion-chunks/recap";
import type {
  CompanionDraft,
  DraftCharacter,
  DraftFact,
  DraftRelationship,
  DraftTimelineEvent,
  DraftGlossaryTerm,
  VisibleAfter,
  PriorSeasonCanon,
} from "./watch-companion-chunks/shared";

export interface GenerateInput {
  tmdbId: number;
  mediaType: "movie" | "tv";
  season?: number; // required for tv
  // Episode-scoped generation for actively-airing seasons. When set, the
  // pipeline loads grounding for that single episode, treats prior episodes
  // of the current season as canon (don't re-emit), skips the recap chunk
  // (recap runs once at season finalization), and APPENDS to existing rows
  // rather than wiping the season. Only valid for tv + season. Used by the
  // cron sweep for incremental episode updates.
  episode?: number;
  // Initial generation for an actively-airing season. Differs from episode
  // mode in that it runs the season-mode pipeline (one Claude pass per
  // chunk for the whole eligible-episodes batch), but with grounding
  // filtered to only the episodes past the 2-day buffer. Recap is skipped.
  // Persist creates a CompanionAiringSeason row instead of adding the
  // season to seasonsGenerated. Only valid for tv + season.
  airingMode?: { eligibleEpisodes: number[] };
  generatedByUserId: string;
}

export interface GenerateResult {
  companionId: string;
  isNew: boolean;
  charactersAdded: number;
  factsAdded: number;
  relationshipsAdded: number;
  timelineAdded: number;
  glossaryAdded: number;
  // Populated when the gen entered airing mode (initial gen of an
  // actively-airing season, or an incremental episode-mode update). The
  // route handler uses this to drive the "you'll be notified when the
  // next episode's companion is ready" UX.
  airing?: {
    seasonNumber: number;
    episodesGenerated: number[];
    status: "airing" | "completed";
  };
}

// ── Progress events streamed from the orchestrator ────────────────────────
// Each step yields a "start" (status: running) then a "done" (status: done)
// with the counts. The final "complete" event carries the GenerateResult.

export type GenerationStep = "grounding" | "characters" | "facts" | "relationships" | "timeline" | "glossary" | "recap" | "persist";

export type ProgressEvent =
  | { kind: "step"; step: GenerationStep; status: "running" }
  | { kind: "step"; step: GenerationStep; status: "done"; count?: number }
  | { kind: "complete"; result: GenerateResult }
  | { kind: "warning"; source: "subtitles"; reason: string; message: string }
  | { kind: "error"; message: string };

/**
 * Streaming, chunked companion generation. Drives 5 sequential Claude calls
 * (characters → facts → relationships → timeline → glossary) and persists at
 * the end. Yields ProgressEvents suitable for SSE relay.
 *
 * Why chunked: a single 12k-token prompt covering all 5 sections kept producing
 * empty timelines / thin glossaries / missed multi-relationships — Sonnet can
 * follow one focused instruction set much better than five stacked. Each
 * chunk is its own ~4k call with focused guidance.
 */
export async function* generateCompanionStream(input: GenerateInput): AsyncGenerator<ProgressEvent> {
  const { tmdbId, mediaType, season, episode, airingMode, generatedByUserId } = input;
  if (mediaType === "tv" && (season === undefined || season === null || season < 1)) {
    yield { kind: "error", message: "season (>= 1) is required for tv companions" };
    return;
  }
  if (episode !== undefined && (mediaType !== "tv" || typeof season !== "number")) {
    yield { kind: "error", message: "episode-scoped generation is only valid for tv with a season" };
    return;
  }
  if (airingMode && (mediaType !== "tv" || typeof season !== "number")) {
    yield { kind: "error", message: "airingMode is only valid for tv with a season" };
    return;
  }
  if (airingMode && episode !== undefined) {
    yield { kind: "error", message: "airingMode and episode are mutually exclusive — pick one" };
    return;
  }
  const episodeArg = typeof episode === "number" && episode > 0 ? episode : null;

  const client = getAnthropic();
  let grounding: CompanionGroundingData;

  // 1. Grounding. Episode-scoped generation hits a leaner loader that only
  // pulls metadata + subtitles for the target episode. Initial airing-
  // season gen pulls full season grounding but with the episodes array
  // filtered to only those past the 2-day buffer. Failures on optional
  // sources (Wikipedia, subtitles) are non-fatal — for a brand-new episode
  // those lookups frequently 404 for ~24h post-air, and the failsafe is to
  // proceed with whatever TMDB metadata we do have.
  yield { kind: "step", step: "grounding", status: "running" };
  try {
    if (mediaType === "movie") {
      grounding = await loadGroundingForMovie(tmdbId);
    } else if (episodeArg !== null) {
      grounding = await loadGroundingForEpisode(tmdbId, season!, episodeArg);
    } else if (airingMode) {
      grounding = await loadGroundingForShow(tmdbId, season!, { episodeFilter: airingMode.eligibleEpisodes });
    } else {
      grounding = await loadGroundingForShow(tmdbId, season!);
    }
  } catch (err) {
    yield { kind: "error", message: `Grounding failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "grounding", status: "done" };

  // Surface subtitle-fetch failures to the admin UI. Generation still
  // proceeds without them, but timestamps fall back to runtime-percentage
  // estimates ("~80% in") instead of dialogue-anchored ones ("81:42") —
  // the moderator should know that's what they're getting and why.
  //
  // For TV we now fetch every episode in the season, so failures get
  // aggregated by reason before emission — emitting one warning per
  // distinct failure type with a count keeps a 10-episode quota wipeout
  // from spamming the admin UI with ten near-identical messages.
  const statuses = grounding.subtitleStatuses ?? [];
  const failed = statuses.filter((s) => !s.ok);
  if (failed.length > 0) {
    const total = statuses.length;
    type Bucket = { count: number; sampleMessage: string };
    const byReason = new Map<string, Bucket>();
    for (const f of failed) {
      if (f.ok) continue; // narrow the type
      const bucket = byReason.get(f.reason);
      if (bucket) bucket.count++;
      else byReason.set(f.reason, { count: 1, sampleMessage: f.message });
    }
    for (const [reason, bucket] of byReason) {
      const message = total > 1
        ? `${bucket.count} of ${total} subtitle fetches failed — ${bucket.sampleMessage}`
        : bucket.sampleMessage;
      yield { kind: "warning", source: "subtitles", reason, message };
    }
  }

  const seasonArg = mediaType === "tv" ? season! : null;

  // Load prior canon — either prior seasons (TV) or prior entries in the
  // same franchise/collection (movies like Dune 2 inheriting from Dune).
  // This is the "iterate on top of earlier content" mechanism that keeps
  // labels and wording consistent across a franchise.
  //
  // Episode-mode: canon also includes EARLIER EPISODES OF THE CURRENT
  // SEASON. The chunks treat that canon as "already in our DB, don't
  // re-emit", which is exactly the behavior we want for an incremental
  // per-episode update appending to a partly-generated season.
  let priorCanon: PriorSeasonCanon | null = null;
  if (mediaType === "tv" && seasonArg !== null) {
    if (episodeArg !== null) {
      priorCanon = await loadPriorAndCurrentSeasonCanon(tmdbId, seasonArg);
    } else if (seasonArg > 1) {
      priorCanon = await loadPriorSeasonCanon(tmdbId, seasonArg);
    }
  } else if (mediaType === "movie") {
    priorCanon = await loadFranchiseCanon(tmdbId);
  }

  // 2. Characters
  yield { kind: "step", step: "characters", status: "running" };
  let characters: DraftCharacter[];
  try {
    characters = await draftCharacters(client, grounding, seasonArg, priorCanon, episodeArg);
  } catch (err) {
    yield { kind: "error", message: `Characters draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "characters", status: "done", count: characters.length };

  // 3. Facts
  yield { kind: "step", step: "facts", status: "running" };
  let facts: DraftFact[];
  try {
    facts = await draftFacts(client, grounding, seasonArg, characters, priorCanon, episodeArg);
  } catch (err) {
    yield { kind: "error", message: `Facts draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "facts", status: "done", count: facts.length };

  // 4. Relationships
  yield { kind: "step", step: "relationships", status: "running" };
  let relationships: DraftRelationship[];
  try {
    relationships = await draftRelationships(client, grounding, seasonArg, characters, priorCanon, episodeArg);
  } catch (err) {
    yield { kind: "error", message: `Relationships draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "relationships", status: "done", count: relationships.length };

  // 5. Timeline
  yield { kind: "step", step: "timeline", status: "running" };
  let timelineEvents: DraftTimelineEvent[];
  try {
    timelineEvents = await draftTimeline(client, grounding, seasonArg, characters, priorCanon, episodeArg);
  } catch (err) {
    yield { kind: "error", message: `Timeline draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "timeline", status: "done", count: timelineEvents.length };

  // 6. Glossary
  yield { kind: "step", step: "glossary", status: "running" };
  let glossary: DraftGlossaryTerm[];
  try {
    glossary = await draftGlossary(client, grounding, seasonArg, priorCanon, episodeArg);
  } catch (err) {
    yield { kind: "error", message: `Glossary draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "glossary", status: "done", count: glossary.length };

  // 7. Recap. Two prose blocks per installment — an INSTALLMENT recap
  // covering only this season/movie, and a SERIES recap that compresses
  // everything through and including the current installment into a
  // single paragraph. Both are gated behind a reveal button on the
  // viewer so full spoilers are fine.
  //
  // The series recap covers EVERY prior installment. We split context
  // into two lists: stored recaps (drafted on a previous gen — used as
  // source of truth) and missing installments (no recap yet — passed as
  // labels + TMDB overview so the AI fills the gap from training data).
  // Without the missing list the recap would silently skip whole
  // installments whenever the user generates out of order (e.g. S5
  // before S2/3/4) — leaving holes in the through-line.
  //
  // Failures are non-fatal: the recap field stays at whatever was
  // there before so a flaky AI call doesn't wipe a good prior recap.
  //
  // Episode-mode AND initial airing-season gen both skip this step. Recap
  // fires once at season finalization (when the last episode + 2 day buffer
  // has passed) so we can summarize the whole season in one shot rather
  // than rewriting the recap every time a new episode drops.
  let recap: RecapResult | null = null;
  if (episodeArg === null && !airingMode) {
    yield { kind: "step", step: "recap", status: "running" };
    try {
      const { stored, missing } = await loadPriorContext(tmdbId, mediaType, seasonArg, grounding);
      recap = await draftRecap(client, grounding, seasonArg, timelineEvents, stored, missing);
    } catch (err) {
      console.error("Recap draft failed (continuing without):", err);
      recap = null;
    }
    yield { kind: "step", step: "recap", status: "done", count: recap ? (recap.series ? 2 : 1) : 0 };
  }

  // 8. Persist
  yield { kind: "step", step: "persist", status: "running" };
  try {
    const draft: CompanionDraft = { characters, facts, relationships, timelineEvents, glossary };
    const result = await persistDraft({
      tmdbId,
      mediaType,
      season: seasonArg,
      episode: episodeArg,
      airingMode,
      title: grounding.title,
      year: grounding.year,
      runtimeSeconds: grounding.runtimeSeconds,
      draft,
      recap,
      generatedByUserId,
    });
    yield { kind: "step", step: "persist", status: "done" };
    yield { kind: "complete", result };
  } catch (err) {
    yield { kind: "error", message: `Persist failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
}

/**
 * Non-streaming wrapper for callers that just want the final result
 * (kept so anything that still hits `generateCompanion` keeps working).
 */
export async function generateCompanion(input: GenerateInput): Promise<GenerateResult> {
  for await (const evt of generateCompanionStream(input)) {
    if (evt.kind === "error") throw new Error(evt.message);
    if (evt.kind === "complete") return evt.result;
  }
  throw new Error("Generation finished without a complete event");
}

interface PersistInput {
  tmdbId: number;
  mediaType: "movie" | "tv";
  season: number | null;
  // When set, this is an incremental per-episode update for an actively-
  // airing season. Persist does NOT wipe the season's existing rows, does
  // NOT add the season to seasonsGenerated (that happens at season
  // finalization in the cron sweep), and dedupes characters by name
  // against rows already on this companion+season.
  episode: number | null;
  // Initial gen for an actively-airing season — full-season pipeline ran
  // with grounding scoped to eligibleEpisodes only. Persist creates a
  // CompanionAiringSeason row, leaves seasonsGenerated alone (the season
  // isn't fully done), and treats this as an authoritative replace of any
  // prior content for the season (regen is allowed pre-completion).
  airingMode: { eligibleEpisodes: number[] } | undefined;
  title: string;
  year: number | null;
  runtimeSeconds: number | null;
  draft: CompanionDraft;
  recap: RecapResult | null;
  generatedByUserId: string;
}

async function persistDraft(input: PersistInput): Promise<GenerateResult> {
  const { tmdbId, mediaType, season, episode, airingMode, title, year, runtimeSeconds, draft, recap, generatedByUserId } = input;
  const isEpisodeMode = episode !== null && season !== null && mediaType === "tv";
  const isInitialAiring = airingMode !== undefined && season !== null && mediaType === "tv";

  const existing = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });

  const isNew = !existing;
  // seasonsGenerated only flips when a season is FULLY done. Both episode
  // mode and initial airing gen leave the season OUT of that list — the
  // cron sweep adds it when the season finalizes (last episode generated +
  // recap drafted + 2-day buffer past).
  const seasonStaysOut = isEpisodeMode || isInitialAiring;
  const newSeasonsGenerated = existing
    ? (seasonStaysOut
        ? existing.seasonsGenerated
        : season !== null
          ? Array.from(new Set([...existing.seasonsGenerated, season])).sort((a, b) => a - b)
          : existing.seasonsGenerated)
    : season !== null && !seasonStaysOut
      ? [season]
      : [];

  // Build the new recaps JSON.
  //
  // Movies persist a single object:
  //   { current: { title, year, installment, series } }
  // where series is null for standalone films (no earlier siblings).
  //
  // TV persists a per-season map:
  //   { "1": { installment, series }, "2": {...}, ... }
  // The current season's slot is overwritten on regen; other seasons
  // are preserved. series is null for season 1.
  //
  // Recap-step failure leaves the existing JSON entirely alone — a
  // flaky AI call shouldn't wipe a perfectly good prior recap.
  let nextRecaps: Record<string, unknown> | undefined;
  if (recap) {
    if (mediaType === "movie") {
      nextRecaps = {
        current: {
          title,
          year: year ?? null,
          installment: recap.installment,
          series: recap.series,
        },
      };
    } else {
      const existingRecaps = (existing?.recaps && typeof existing.recaps === "object" && !Array.isArray(existing.recaps))
        ? (existing.recaps as Record<string, unknown>)
        : {};
      nextRecaps = {
        ...existingRecaps,
        [String(season)]: { installment: recap.installment, series: recap.series },
      };
    }
  }

  const companion = await prisma.watchCompanion.upsert({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
    create: {
      tmdbId,
      mediaType,
      title,
      runtimeSeconds,
      seasonsGenerated: newSeasonsGenerated,
      status: "draft",
      generatedBy: generatedByUserId,
      lastGeneratedAt: new Date(),
      // Prisma's InputJsonValue rejects Record<string, unknown> because
      // unknown could in principle include non-JSON values. Cast through
      // unknown to satisfy the type checker — the values we put in are
      // always JSON-shaped (strings, nested objects with the same).
      ...(nextRecaps !== undefined ? { recaps: nextRecaps as unknown as object } : {}),
    },
    update: {
      title,
      runtimeSeconds: runtimeSeconds ?? existing?.runtimeSeconds ?? null,
      seasonsGenerated: newSeasonsGenerated,
      lastGeneratedAt: new Date(),
      // Prisma's InputJsonValue rejects Record<string, unknown> because
      // unknown could in principle include non-JSON values. Cast through
      // unknown to satisfy the type checker — the values we put in are
      // always JSON-shaped (strings, nested objects with the same).
      ...(nextRecaps !== undefined ? { recaps: nextRecaps as unknown as object } : {}),
    },
  });

  // Scoped wipe — only the season being generated. Each content row carries
  // a seasonNumber so we can target it reliably. For movies (season === null)
  // the wipe is a simple nuclear-by-companion since there's only ever one
  // generation. The prior implementation's nuclear wipe is what killed
  // Succession S1 when S2 got generated — don't bring it back.
  //
  // Episode mode skips the wipe entirely — it's strictly additive over
  // whatever earlier episodes already populated for this season.
  if (!isNew && !isEpisodeMode) {
    if (mediaType === "movie") {
      await Promise.all([
        prisma.companionCharacter.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionRelationship.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionTimelineEvent.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionGlossaryTerm.deleteMany({ where: { companionId: companion.id } }),
      ]);
    } else if (season !== null) {
      await Promise.all([
        prisma.companionCharacter.deleteMany({ where: { companionId: companion.id, seasonNumber: season } }),
        prisma.companionRelationship.deleteMany({ where: { companionId: companion.id, seasonNumber: season } }),
        prisma.companionTimelineEvent.deleteMany({ where: { companionId: companion.id, seasonNumber: season } }),
        prisma.companionGlossaryTerm.deleteMany({ where: { companionId: companion.id, seasonNumber: season } }),
      ]);
    }
  }

  // Characters first so we have name → id for facts / relationships / timeline.
  // Every content row gets stamped with the seasonNumber being generated (or
  // null for movies) so regeneration can scope correctly later.
  //
  // Episode mode preloads every character already on this companion+season
  // so the chunk's downstream references (facts, relationships, timeline)
  // can resolve names that the AI references but didn't re-emit (per the
  // append-only contract). Newly emitted characters are still inserted —
  // we just dedupe by name against the preload first.
  const nameToId = new Map<string, string>();
  let charactersAdded = 0;
  if (isEpisodeMode && season !== null) {
    const existingChars = await prisma.companionCharacter.findMany({
      where: { companionId: companion.id, seasonNumber: season },
      select: { id: true, name: true },
    });
    for (const c of existingChars) nameToId.set(c.name, c.id);
  }

  for (const [idx, c] of draft.characters.entries()) {
    // In episode mode, skip any character whose name is already on this
    // companion+season — the prompt instructed the AI not to re-emit
    // existing characters, but if it slipped one through anyway we
    // silently drop the duplicate rather than create a sibling row.
    if (isEpisodeMode && nameToId.has(c.name)) continue;

    // Build the actors list. Always include the primary actor (actorName +
    // actorTmdbId on the char row) so the side-table row count reflects
    // reality even when the AI emitted an empty actors array for a single-
    // actor character. De-dupe in case the AI lists the primary actor again
    // inside the actors array.
    const actorEntries: Array<{ actorName: string; actorTmdbId: number | null; note: string | null; visibleAfter: { seconds?: number; season?: number; episode?: number } }> = [];
    const seenActorKeys = new Set<string>();
    if (c.actorName) {
      const key = `${c.actorName}|${c.actorTmdbId ?? "?"}`;
      seenActorKeys.add(key);
      actorEntries.push({
        actorName: c.actorName,
        actorTmdbId: c.actorTmdbId,
        note: null,
        visibleAfter: serialize(c.visibleAfter),
      });
    }
    for (const a of c.actors ?? []) {
      const key = `${a.actorName}|${a.actorTmdbId ?? "?"}`;
      if (seenActorKeys.has(key)) continue;
      seenActorKeys.add(key);
      actorEntries.push({
        actorName: a.actorName,
        actorTmdbId: a.actorTmdbId,
        note: a.note,
        visibleAfter: serialize(a.visibleAfter),
      });
    }

    // Name aliases (twist reveals). Stored as JSON on the character row.
    const nameAliases = (c.nameAliases ?? []).map((n) => ({
      name: n.name,
      visibleAfter: serialize(n.visibleAfter),
    }));

    // Group/faction history (defections, hidden allegiance reveals).
    // Same shape as nameAliases — array of { group, visibleAfter }.
    const groupHistory = (c.groupHistory ?? []).map((g) => ({
      group: g.group,
      visibleAfter: serialize(g.visibleAfter),
    }));

    const char = await prisma.companionCharacter.create({
      data: {
        companionId: companion.id,
        seasonNumber: season,
        name: c.name,
        actorName: c.actorName,
        actorTmdbId: c.actorTmdbId,
        baseDescription: c.baseDescription,
        group: c.group,
        visibleAfter: serialize(c.visibleAfter),
        sortOrder: idx,
        nameAliases: nameAliases.length > 0 ? nameAliases : undefined,
        groupHistory: groupHistory.length > 0 ? groupHistory : undefined,
      },
    });
    // Write the actors side-table rows. We skip createMany for clarity and
    // because a character typically has 1-3 actors.
    if (actorEntries.length > 0) {
      await prisma.companionCharacterActor.createMany({
        data: actorEntries.map((a, actorIdx) => ({
          characterId: char.id,
          actorName: a.actorName,
          actorTmdbId: a.actorTmdbId,
          note: a.note,
          visibleAfter: a.visibleAfter,
          sortOrder: actorIdx,
        })),
      });
    }
    nameToId.set(c.name, char.id);
    charactersAdded++;
  }

  // Facts — separate chunk in the new pipeline, resolved to character IDs.
  let factsAdded = 0;
  const factRows = draft.facts
    .map((f) => {
      const characterId = nameToId.get(f.characterName);
      if (!characterId) return null;
      return {
        characterId,
        fact: f.fact,
        factType: f.factType,
        visibleAfter: serialize(f.visibleAfter),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (factRows.length > 0) {
    await prisma.companionFact.createMany({ data: factRows });
    factsAdded = factRows.length;
  }

  // Relationships
  let relationshipsAdded = 0;
  for (const r of draft.relationships) {
    const fromId = nameToId.get(r.fromName);
    const toId = nameToId.get(r.toName);
    if (!fromId || !toId) continue;
    await prisma.companionRelationship.create({
      data: {
        companionId: companion.id,
        seasonNumber: season,
        fromCharacterId: fromId,
        toCharacterId: toId,
        relationshipType: r.relationshipType,
        label: r.label,
        directed: r.directed,
        visibleAfter: serialize(r.visibleAfter),
      },
    });
    relationshipsAdded++;
  }

  // Timeline
  let timelineAdded = 0;
  if (draft.timelineEvents.length > 0) {
    const events = draft.timelineEvents.map((e) => ({
      companionId: companion.id,
      seasonNumber: season,
      description: e.description,
      characterIds: e.characterNames.map((n) => nameToId.get(n)).filter((id): id is string => !!id),
      importance: e.importance,
      visibleAfter: serialize(e.visibleAfter),
    }));
    await prisma.companionTimelineEvent.createMany({ data: events });
    timelineAdded = events.length;
  }

  // Glossary — preserve most-obscure-first ordering.
  let glossaryAdded = 0;
  if (draft.glossary.length > 0) {
    await prisma.companionGlossaryTerm.createMany({
      data: draft.glossary.map((g, idx) => ({
        companionId: companion.id,
        seasonNumber: season,
        term: g.term,
        definition: g.definition,
        category: g.category,
        visibleAfter: serialize(g.visibleAfter),
        sortOrder: idx,
      })),
    });
    glossaryAdded = draft.glossary.length;
  }

  // Upsert the airing-season tracker. Initial airing gen seeds the row
  // with status='airing' and episodesGenerated set to the eligible-episodes
  // batch we just covered. Episode-mode appends the just-generated episode
  // to the existing row. Both reset failureCount + lastError on success.
  let airingSummary: GenerateResult["airing"];
  if (isInitialAiring && season !== null && airingMode) {
    const eligible = Array.from(new Set(airingMode.eligibleEpisodes)).sort((a, b) => a - b);
    await prisma.companionAiringSeason.upsert({
      where: { companionId_seasonNumber: { companionId: companion.id, seasonNumber: season } },
      create: {
        companionId: companion.id,
        seasonNumber: season,
        episodesGenerated: eligible,
        status: "airing",
        lastSweepAt: new Date(),
        failureCount: 0,
        lastError: null,
      },
      update: {
        // Re-running the initial gen replaces episodesGenerated with the
        // current eligible set — covers the case where an admin regenerates
        // a partially-airing season after another episode aired.
        episodesGenerated: eligible,
        status: "airing",
        lastSweepAt: new Date(),
        failureCount: 0,
        lastError: null,
      },
    });
    airingSummary = { seasonNumber: season, episodesGenerated: eligible, status: "airing" };
  } else if (isEpisodeMode && season !== null && episode !== null) {
    const existingRow = await prisma.companionAiringSeason.findUnique({
      where: { companionId_seasonNumber: { companionId: companion.id, seasonNumber: season } },
      select: { episodesGenerated: true, status: true },
    });
    const merged = Array.from(new Set([...(existingRow?.episodesGenerated ?? []), episode])).sort((a, b) => a - b);
    await prisma.companionAiringSeason.upsert({
      where: { companionId_seasonNumber: { companionId: companion.id, seasonNumber: season } },
      create: {
        companionId: companion.id,
        seasonNumber: season,
        episodesGenerated: [episode],
        status: "airing",
        lastSweepAt: new Date(),
        failureCount: 0,
        lastError: null,
      },
      update: {
        episodesGenerated: merged,
        lastSweepAt: new Date(),
        failureCount: 0,
        lastError: null,
      },
    });
    airingSummary = {
      seasonNumber: season,
      episodesGenerated: merged,
      status: existingRow?.status === "completed" ? "completed" : "airing",
    };
  }

  return {
    companionId: companion.id,
    isNew,
    charactersAdded,
    factsAdded,
    relationshipsAdded,
    timelineAdded,
    glossaryAdded,
    ...(airingSummary ? { airing: airingSummary } : {}),
  };
}

function serialize(v: VisibleAfter): { seconds?: number; season?: number; episode?: number } {
  const out: { seconds?: number; season?: number; episode?: number } = {};
  if (typeof v.seconds === "number") out.seconds = v.seconds;
  if (typeof v.season === "number") out.season = v.season;
  if (typeof v.episode === "number") out.episode = v.episode;
  return out;
}

/**
 * Loads context for every prior installment in the series, split into
 * two lists for the recap chunk:
 *
 *   - stored: installments that already have a drafted INSTALLMENT
 *     recap. Full text is the source of truth.
 *
 *   - missing: installments that don't have a recap yet. Only label +
 *     TMDB overview blurb is passed; the AI fills the gap from
 *     training-data knowledge. Without this list the series recap
 *     would silently skip whole installments whenever the user
 *     generates out of order (S5 before S2/3/4).
 *
 * Movies: walks earlier parts of the same TMDB collection (sorted by
 * release date). Each part is either stored or missing depending on
 * whether a published companion exists for that tmdbId with installment
 * text.
 *
 * TV: walks seasons 1..currentSeason-1 of the current companion. Each
 * is either stored (slot has installment text) or missing (no slot, or
 * slot has no text yet). Missing entries pull `overview` from the TMDB
 * season metadata already on grounding.
 *
 * Both empty signals "first installment" — the recap chunk skips the
 * series block in that case so we don't waste a Sonnet call writing a
 * duplicate of the installment recap.
 */
export async function loadPriorContext(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season: number | null,
  grounding: CompanionGroundingData,
): Promise<{ stored: PriorRecapEntry[]; missing: PriorMissingEntry[] }> {
  if (mediaType === "tv") {
    if (season === null || season <= 1) return { stored: [], missing: [] };
    const companion = await prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
      select: { recaps: true },
    });
    const recaps = (companion?.recaps && typeof companion.recaps === "object" && !Array.isArray(companion.recaps))
      ? (companion.recaps as Record<string, unknown>)
      : {};

    const seasonOverviews = grounding.source === "tv" ? (grounding.seasons ?? []) : [];
    const stored: PriorRecapEntry[] = [];
    const missing: PriorMissingEntry[] = [];
    for (let n = 1; n < season; n++) {
      const slot = recaps[String(n)];
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

  // Movies — walk the franchise collection.
  try {
    const movie = grounding.tmdb as TMDBMovie;
    const collectionId = movie.belongs_to_collection?.id;
    if (!collectionId) return { stored: [], missing: [] };
    const collection = await getCollectionDetails(collectionId);
    const targetDate = movie.release_date ? new Date(movie.release_date) : null;
    const earlierParts = (collection.parts ?? [])
      .filter((p) => p.id !== tmdbId)
      .filter((p) => {
        if (!targetDate || !p.release_date) return false;
        const pd = new Date(p.release_date);
        return pd.getTime() < targetDate.getTime();
      })
      .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
    if (earlierParts.length === 0) return { stored: [], missing: [] };

    const partIds = earlierParts.map((p) => p.id);
    const companions = await prisma.watchCompanion.findMany({
      where: { mediaType: "movie", status: "published", tmdbId: { in: partIds } },
      select: { tmdbId: true, recaps: true },
    });
    const byTmdbId = new Map<number, { recaps: unknown }>();
    for (const c of companions) byTmdbId.set(c.tmdbId, c);

    const stored: PriorRecapEntry[] = [];
    const missing: PriorMissingEntry[] = [];
    for (const part of earlierParts) {
      const yearStr = part.release_date ? part.release_date.slice(0, 4) : null;
      const year = yearStr ? Number(yearStr) : null;
      const yearSuffix = yearStr ? ` (${yearStr})` : "";
      const label = `${part.title}${yearSuffix}`;

      const c = byTmdbId.get(part.id);
      const blob = (c?.recaps && typeof c.recaps === "object" && !Array.isArray(c.recaps))
        ? (c.recaps as { current?: { installment?: unknown; text?: unknown } })
        : null;
      const inst = blob?.current?.installment ?? blob?.current?.text; // fall back to old `text` shape
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
  } catch (err) {
    console.error("loadPriorContext movie path failed (continuing without):", err);
    return { stored: [], missing: [] };
  }
}

/**
 * Episode-mode canon load. Same shape as loadPriorSeasonCanon but the
 * filter is `seasonNumber: { lte: currentSeason }` instead of `lt`, so
 * earlier-episode content already saved for the CURRENT season is included
 * as canon. The chunk prompts treat the canon list as "already exists in
 * our DB, do not re-emit", which is exactly what we want for an
 * incremental per-episode update appending to a partly-generated season.
 *
 * Returns null when nothing has been generated yet (first episode of a
 * brand-new airing season).
 */
async function loadPriorAndCurrentSeasonCanon(tmdbId: number, currentSeason: number): Promise<PriorSeasonCanon | null> {
  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
    select: { id: true },
  });
  if (!companion) return null;
  return loadCanonForCompanion(companion.id, { lte: currentSeason });
}

/**
 * Pulls a compact summary of all content that was canonicalized in seasons
 * before the one being generated. Used to keep wording consistent across
 * seasons (relationship labels especially — this is what stops Greg from
 * being relabeled "grandchild of Logan's sibling" in S2 after being a
 * "great-nephew" in S1).
 *
 * We dedupe by name/term because characters typically appear in multiple
 * prior seasons — the earliest version wins (the later-season row's
 * baseDescription often includes spoilers for its own season).
 */
async function loadPriorSeasonCanon(tmdbId: number, currentSeason: number): Promise<PriorSeasonCanon | null> {
  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
    select: { id: true },
  });
  if (!companion) return null;
  return loadCanonForCompanion(companion.id, { lt: currentSeason });
}

/**
 * Shared body for loadPriorSeasonCanon (lt currentSeason, used for cross-
 * season continuity) and loadPriorAndCurrentSeasonCanon (lte currentSeason,
 * used for episode-mode incremental updates that need to dedupe against
 * earlier episodes of the same season).
 */
async function loadCanonForCompanion(
  companionId: string,
  seasonFilter: { lt: number } | { lte: number },
): Promise<PriorSeasonCanon | null> {
  const [characters, relationships, glossary] = await Promise.all([
    prisma.companionCharacter.findMany({
      where: { companionId, seasonNumber: seasonFilter },
      orderBy: [{ seasonNumber: "asc" }, { sortOrder: "asc" }],
      select: { name: true, baseDescription: true, group: true },
    }),
    prisma.companionRelationship.findMany({
      where: { companionId, seasonNumber: seasonFilter },
      orderBy: { seasonNumber: "asc" },
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
    }),
    prisma.companionGlossaryTerm.findMany({
      where: { companionId, seasonNumber: seasonFilter },
      orderBy: [{ seasonNumber: "asc" }, { sortOrder: "asc" }],
      select: { term: true, definition: true },
    }),
  ]);

  const seenChar = new Set<string>();
  const charCanon: PriorSeasonCanon["characters"] = [];
  for (const c of characters) {
    if (seenChar.has(c.name)) continue;
    seenChar.add(c.name);
    charCanon.push({ name: c.name, baseDescription: c.baseDescription, group: c.group });
  }

  const seenRel = new Set<string>();
  const relCanon: PriorSeasonCanon["relationships"] = [];
  for (const r of relationships) {
    const fromName = r.from?.name ?? "";
    const toName = r.to?.name ?? "";
    if (!fromName || !toName) continue;
    const key = `${fromName}|${toName}|${r.label}|${r.relationshipType}`;
    if (seenRel.has(key)) continue;
    seenRel.add(key);
    relCanon.push({ fromName, toName, label: r.label, relationshipType: r.relationshipType });
  }

  const seenTerm = new Set<string>();
  const glossCanon: PriorSeasonCanon["glossary"] = [];
  for (const g of glossary) {
    if (seenTerm.has(g.term)) continue;
    seenTerm.add(g.term);
    glossCanon.push({ term: g.term, definition: g.definition });
  }

  if (charCanon.length === 0 && relCanon.length === 0 && glossCanon.length === 0) return null;
  return { characters: charCanon, relationships: relCanon, glossary: glossCanon };
}

/**
 * Franchise equivalent of loadPriorSeasonCanon: for a movie that belongs to a
 * TMDB collection (Dune → Dune 2 → Dune: Part Three…), pull canon from any
 * earlier franchise entries that already have published companions.
 *
 * "Earlier" = released before this movie. A sequel generated before the
 * prequel exists will return null canon for the sequel run, which is fine —
 * the prequel's generator will see the sequel's canon if/when it runs later,
 * but that's an edge case outside our usual ordering.
 *
 * Returns null if the movie has no collection or no earlier entries have
 * published companions yet.
 */
async function loadFranchiseCanon(tmdbId: number): Promise<PriorSeasonCanon | null> {
  try {
    const movie = await getMovieDetails(tmdbId);
    const collectionId = movie.belongs_to_collection?.id;
    if (!collectionId) return null;

    const collection = await getCollectionDetails(collectionId);
    const targetDate = movie.release_date ? new Date(movie.release_date) : null;
    // Earlier parts only — avoid pulling future sequels into a prequel gen.
    const earlierParts = collection.parts
      .filter((p) => p.id !== tmdbId)
      .filter((p) => {
        if (!targetDate || !p.release_date) return true; // be lenient
        return new Date(p.release_date) < targetDate;
      });
    if (earlierParts.length === 0) return null;

    const priorCompanions = await prisma.watchCompanion.findMany({
      where: {
        mediaType: "movie",
        status: "published",
        tmdbId: { in: earlierParts.map((p) => p.id) },
      },
      select: { id: true },
    });
    if (priorCompanions.length === 0) return null;
    const ids = priorCompanions.map((c) => c.id);

    const [characters, relationships, glossary] = await Promise.all([
      prisma.companionCharacter.findMany({
        where: { companionId: { in: ids } },
        orderBy: { sortOrder: "asc" },
        select: { name: true, baseDescription: true, group: true },
      }),
      prisma.companionRelationship.findMany({
        where: { companionId: { in: ids } },
        include: { from: { select: { name: true } }, to: { select: { name: true } } },
      }),
      prisma.companionGlossaryTerm.findMany({
        where: { companionId: { in: ids } },
        orderBy: { sortOrder: "asc" },
        select: { term: true, definition: true },
      }),
    ]);

    // Same dedup logic as the TV variant — earliest version of a name/term
    // wins so we don't shove spoilery later-movie descriptions into the new
    // gen's prompt.
    const seenChar = new Set<string>();
    const charCanon: PriorSeasonCanon["characters"] = [];
    for (const c of characters) {
      if (seenChar.has(c.name)) continue;
      seenChar.add(c.name);
      charCanon.push({ name: c.name, baseDescription: c.baseDescription, group: c.group });
    }

    const seenRel = new Set<string>();
    const relCanon: PriorSeasonCanon["relationships"] = [];
    for (const r of relationships) {
      const fromName = r.from?.name ?? "";
      const toName = r.to?.name ?? "";
      if (!fromName || !toName) continue;
      const key = `${fromName}|${toName}|${r.label}|${r.relationshipType}`;
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      relCanon.push({ fromName, toName, label: r.label, relationshipType: r.relationshipType });
    }

    const seenTerm = new Set<string>();
    const glossCanon: PriorSeasonCanon["glossary"] = [];
    for (const g of glossary) {
      if (seenTerm.has(g.term)) continue;
      seenTerm.add(g.term);
      glossCanon.push({ term: g.term, definition: g.definition });
    }

    if (charCanon.length === 0 && relCanon.length === 0 && glossCanon.length === 0) return null;
    return { characters: charCanon, relationships: relCanon, glossary: glossCanon };
  } catch (err) {
    console.error("loadFranchiseCanon error (falling back to empty):", err);
    return null;
  }
}
