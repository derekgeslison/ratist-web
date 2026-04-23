import { prisma } from "@/lib/prisma";
import { getAnthropic } from "./client";
import { loadGroundingForMovie, loadGroundingForShow, type CompanionGroundingData } from "./watch-companion-grounding";
import { draftCharacters } from "./watch-companion-chunks/characters";
import { draftFacts } from "./watch-companion-chunks/facts";
import { draftRelationships } from "./watch-companion-chunks/relationships";
import { draftTimeline } from "./watch-companion-chunks/timeline";
import { draftGlossary } from "./watch-companion-chunks/glossary";
import type {
  CompanionDraft,
  DraftCharacter,
  DraftFact,
  DraftRelationship,
  DraftTimelineEvent,
  DraftGlossaryTerm,
  VisibleAfter,
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

export type GenerationStep = "grounding" | "characters" | "facts" | "relationships" | "timeline" | "glossary" | "persist";

export type ProgressEvent =
  | { kind: "step"; step: GenerationStep; status: "running" }
  | { kind: "step"; step: GenerationStep; status: "done"; count?: number }
  | { kind: "complete"; result: GenerateResult }
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

  const seasonArg = mediaType === "tv" ? season! : null;

  // 2. Characters
  yield { kind: "step", step: "characters", status: "running" };
  let characters: DraftCharacter[];
  try {
    characters = await draftCharacters(client, grounding, seasonArg);
  } catch (err) {
    yield { kind: "error", message: `Characters draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "characters", status: "done", count: characters.length };

  // 3. Facts
  yield { kind: "step", step: "facts", status: "running" };
  let facts: DraftFact[];
  try {
    facts = await draftFacts(client, grounding, seasonArg, characters);
  } catch (err) {
    yield { kind: "error", message: `Facts draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "facts", status: "done", count: facts.length };

  // 4. Relationships
  yield { kind: "step", step: "relationships", status: "running" };
  let relationships: DraftRelationship[];
  try {
    relationships = await draftRelationships(client, grounding, seasonArg, characters);
  } catch (err) {
    yield { kind: "error", message: `Relationships draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "relationships", status: "done", count: relationships.length };

  // 5. Timeline
  yield { kind: "step", step: "timeline", status: "running" };
  let timelineEvents: DraftTimelineEvent[];
  try {
    timelineEvents = await draftTimeline(client, grounding, seasonArg, characters);
  } catch (err) {
    yield { kind: "error", message: `Timeline draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "timeline", status: "done", count: timelineEvents.length };

  // 6. Glossary
  yield { kind: "step", step: "glossary", status: "running" };
  let glossary: DraftGlossaryTerm[];
  try {
    glossary = await draftGlossary(client, grounding, seasonArg);
  } catch (err) {
    yield { kind: "error", message: `Glossary draft failed: ${err instanceof Error ? err.message : String(err)}` };
    return;
  }
  yield { kind: "step", step: "glossary", status: "done", count: glossary.length };

  // 7. Persist
  yield { kind: "step", step: "persist", status: "running" };
  try {
    const draft: CompanionDraft = { characters, facts, relationships, timelineEvents, glossary };
    const result = await persistDraft({
      tmdbId,
      mediaType,
      season: seasonArg,
      title: grounding.title,
      runtimeSeconds: grounding.runtimeSeconds,
      draft,
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
  runtimeSeconds: number | null;
  draft: CompanionDraft;
  generatedByUserId: string;
}

async function persistDraft(input: PersistInput): Promise<GenerateResult> {
  const { tmdbId, mediaType, season, title, runtimeSeconds, draft, generatedByUserId } = input;

  const existing = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });

  const isNew = !existing;
  const newSeasonsGenerated = existing && season !== null
    ? Array.from(new Set([...existing.seasonsGenerated, season])).sort((a, b) => a - b)
    : season !== null
    ? [season]
    : [];

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
    },
    update: {
      title,
      runtimeSeconds: runtimeSeconds ?? existing?.runtimeSeconds ?? null,
      seasonsGenerated: newSeasonsGenerated,
      lastGeneratedAt: new Date(),
    },
  });

  // Nuclear wipe on regen — partial deletes kept leaking duplicate character
  // cards. See earlier comment in the pre-chunked version for the full
  // context.
  if (!isNew) {
    await Promise.all([
      prisma.companionCharacter.deleteMany({ where: { companionId: companion.id } }),
      prisma.companionRelationship.deleteMany({ where: { companionId: companion.id } }),
      prisma.companionTimelineEvent.deleteMany({ where: { companionId: companion.id } }),
      prisma.companionGlossaryTerm.deleteMany({ where: { companionId: companion.id } }),
    ]);
    if (mediaType === "tv" && season !== null) {
      await prisma.watchCompanion.update({
        where: { id: companion.id },
        data: { seasonsGenerated: [season] },
      });
    }
  }

  // Characters first so we have name → id for facts / relationships / timeline.
  const nameToId = new Map<string, string>();
  let charactersAdded = 0;

  for (const [idx, c] of draft.characters.entries()) {
    const char = await prisma.companionCharacter.create({
      data: {
        companionId: companion.id,
        name: c.name,
        actorName: c.actorName,
        actorTmdbId: c.actorTmdbId,
        baseDescription: c.baseDescription,
        group: c.group,
        visibleAfter: serialize(c.visibleAfter),
        sortOrder: idx,
      },
    });
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
