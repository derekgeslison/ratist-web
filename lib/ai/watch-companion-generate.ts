import { prisma } from "@/lib/prisma";
import { getAnthropic } from "./client";
import { getMovieDetails, getCollectionDetails } from "@/lib/tmdb";
import { loadGroundingForMovie, loadGroundingForShow, type CompanionGroundingData } from "./watch-companion-grounding";
import { draftCharacters } from "./watch-companion-chunks/characters";
import { draftFacts } from "./watch-companion-chunks/facts";
import { draftRelationships } from "./watch-companion-chunks/relationships";
import { draftTimeline } from "./watch-companion-chunks/timeline";
import { draftGlossary } from "./watch-companion-chunks/glossary";
import { draftRecap } from "./watch-companion-chunks/recap";
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
  const { tmdbId, mediaType, season, generatedByUserId } = input;
  if (mediaType === "tv" && (season === undefined || season === null || season < 1)) {
    yield { kind: "error", message: "season (>= 1) is required for tv companions" };
    return;
  }

  const client = getAnthropic();
  let grounding: CompanionGroundingData;

  // 1. Grounding
  yield { kind: "step", step: "grounding", status: "running" };
  try {
    grounding = mediaType === "movie"
      ? await loadGroundingForMovie(tmdbId)
      : await loadGroundingForShow(tmdbId, season!);
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
  let priorCanon: PriorSeasonCanon | null = null;
  if (mediaType === "tv" && seasonArg !== null && seasonArg > 1) {
    priorCanon = await loadPriorSeasonCanon(tmdbId, seasonArg);
  } else if (mediaType === "movie") {
    priorCanon = await loadFranchiseCanon(tmdbId);
  }

  // 2. Characters
  yield { kind: "step", step: "characters", status: "running" };
  let characters: DraftCharacter[];
  try {
    characters = await draftCharacters(client, grounding, seasonArg, priorCanon);
  } catch (err) {
    yield { kind: "error", message: `Characters draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "characters", status: "done", count: characters.length };

  // 3. Facts
  yield { kind: "step", step: "facts", status: "running" };
  let facts: DraftFact[];
  try {
    facts = await draftFacts(client, grounding, seasonArg, characters, priorCanon);
  } catch (err) {
    yield { kind: "error", message: `Facts draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "facts", status: "done", count: facts.length };

  // 4. Relationships
  yield { kind: "step", step: "relationships", status: "running" };
  let relationships: DraftRelationship[];
  try {
    relationships = await draftRelationships(client, grounding, seasonArg, characters, priorCanon);
  } catch (err) {
    yield { kind: "error", message: `Relationships draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "relationships", status: "done", count: relationships.length };

  // 5. Timeline
  yield { kind: "step", step: "timeline", status: "running" };
  let timelineEvents: DraftTimelineEvent[];
  try {
    timelineEvents = await draftTimeline(client, grounding, seasonArg, characters, priorCanon);
  } catch (err) {
    yield { kind: "error", message: `Timeline draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "timeline", status: "done", count: timelineEvents.length };

  // 6. Glossary
  yield { kind: "step", step: "glossary", status: "running" };
  let glossary: DraftGlossaryTerm[];
  try {
    glossary = await draftGlossary(client, grounding, seasonArg, priorCanon);
  } catch (err) {
    yield { kind: "error", message: `Glossary draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "glossary", status: "done", count: glossary.length };

  // 7. Recap. One paragraph "what happened previously" prose — the
  // viewer's Recap tab gates this behind a reveal button so spoilers
  // are fine. For TV we generate only the current season's slot;
  // existing season recaps in the row's JSON are preserved by the
  // persist step. Failures here are non-fatal — generation completes
  // without a recap, viewer falls back to "no recap available".
  yield { kind: "step", step: "recap", status: "running" };
  let recapText: string | null = null;
  try {
    recapText = await draftRecap(client, grounding, seasonArg, timelineEvents);
  } catch (err) {
    console.error("Recap draft failed (continuing without):", err);
    recapText = null;
  }
  yield { kind: "step", step: "recap", status: "done", count: recapText ? 1 : 0 };

  // 8. Persist
  yield { kind: "step", step: "persist", status: "running" };
  try {
    const draft: CompanionDraft = { characters, facts, relationships, timelineEvents, glossary };
    const result = await persistDraft({
      tmdbId,
      mediaType,
      season: seasonArg,
      title: grounding.title,
      year: grounding.year,
      runtimeSeconds: grounding.runtimeSeconds,
      draft,
      recapText,
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
  title: string;
  year: number | null;
  runtimeSeconds: number | null;
  draft: CompanionDraft;
  recapText: string | null;
  generatedByUserId: string;
}

async function persistDraft(input: PersistInput): Promise<GenerateResult> {
  const { tmdbId, mediaType, season, title, year, runtimeSeconds, draft, recapText, generatedByUserId } = input;

  const existing = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });

  const isNew = !existing;
  const newSeasonsGenerated = existing && season !== null
    ? Array.from(new Set([...existing.seasonsGenerated, season])).sort((a, b) => a - b)
    : season !== null
    ? [season]
    : [];

  // Build the new recaps JSON. For movies the shape is
  //   { current: { title, year, text }, prior: [...] }
  // — prior entries are pulled by the viewer at read time from
  // franchise-sibling companions, so we only persist the current
  // installment's text here. For TV we merge the current season's
  // text into the existing { "1": ..., "2": ... } map, preserving
  // any other seasons' recaps. Recap-step failure leaves the
  // existing JSON alone rather than wiping it.
  let nextRecaps: Record<string, unknown> | undefined;
  if (recapText) {
    if (mediaType === "movie") {
      nextRecaps = { current: { title, year: year ?? null, text: recapText } };
    } else {
      const existingRecaps = (existing?.recaps && typeof existing.recaps === "object" && !Array.isArray(existing.recaps))
        ? (existing.recaps as Record<string, unknown>)
        : {};
      nextRecaps = { ...existingRecaps, [String(season)]: recapText };
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
  if (!isNew) {
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
  const nameToId = new Map<string, string>();
  let charactersAdded = 0;

  for (const [idx, c] of draft.characters.entries()) {
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

  return {
    companionId: companion.id,
    isNew,
    charactersAdded,
    factsAdded,
    relationshipsAdded,
    timelineAdded,
    glossaryAdded,
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

  const [characters, relationships, glossary] = await Promise.all([
    prisma.companionCharacter.findMany({
      where: { companionId: companion.id, seasonNumber: { lt: currentSeason } },
      orderBy: [{ seasonNumber: "asc" }, { sortOrder: "asc" }],
      select: { name: true, baseDescription: true, group: true },
    }),
    prisma.companionRelationship.findMany({
      where: { companionId: companion.id, seasonNumber: { lt: currentSeason } },
      orderBy: { seasonNumber: "asc" },
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
    }),
    prisma.companionGlossaryTerm.findMany({
      where: { companionId: companion.id, seasonNumber: { lt: currentSeason } },
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
