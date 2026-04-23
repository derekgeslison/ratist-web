import { prisma } from "@/lib/prisma";
import { loadGroundingForMovie, loadGroundingForShow } from "./watch-companion-grounding";
import { draftWatchCompanion, type CompanionDraft, type VisibleAfter } from "./watch-companion-draft";

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

/**
 * End-to-end companion generation: pulls grounding data, calls Claude, and
 * writes the draft rows into the DB. Upserts the top-level WatchCompanion
 * record so subsequent seasons of a show append rather than replace.
 *
 * Generated content lands in status="draft" — an admin publishes after review.
 */
export async function generateCompanion(input: GenerateInput): Promise<GenerateResult> {
  const { tmdbId, mediaType, season, generatedByUserId } = input;
  if (mediaType === "tv" && (season === undefined || season === null || season < 1)) {
    throw new Error("season (>= 1) is required for tv companions");
  }

  // 1. Pull grounding
  const grounding = mediaType === "movie"
    ? await loadGroundingForMovie(tmdbId)
    : await loadGroundingForShow(tmdbId, season!);

  // 2. Claude draft
  const draft = await draftWatchCompanion({ grounding, season: mediaType === "tv" ? season! : null });

  // 3. Persist
  return persistDraft({
    tmdbId,
    mediaType,
    season: mediaType === "tv" ? season! : null,
    title: grounding.title,
    runtimeSeconds: grounding.runtimeSeconds,
    draft,
    generatedByUserId,
  });
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

  // Upsert the top-level companion
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
      title, // refresh in case it changed
      runtimeSeconds: runtimeSeconds ?? existing?.runtimeSeconds ?? null,
      seasonsGenerated: newSeasonsGenerated,
      lastGeneratedAt: new Date(),
    },
  });

  // If regenerating the same season of a show, wipe the prior rows for that
  // season so we don't duplicate. Movies regenerate wholesale.
  if (!isNew) {
    if (mediaType === "movie") {
      await Promise.all([
        prisma.companionCharacter.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionRelationship.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionTimelineEvent.deleteMany({ where: { companionId: companion.id } }),
        prisma.companionGlossaryTerm.deleteMany({ where: { companionId: companion.id } }),
      ]);
    } else {
      // For shows: remove only content tagged for this season. Keep earlier-
      // season content intact.
      await deleteSeasonSpecificContent(companion.id, season!);
    }
  }

  // Insert characters first so we have IDs to map names → IDs
  const nameToId = new Map<string, string>();
  let charactersAdded = 0;
  let factsAdded = 0;

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

    if (c.facts.length > 0) {
      await prisma.companionFact.createMany({
        data: c.facts.map((f) => ({
          characterId: char.id,
          fact: f.fact,
          factType: f.factType,
          visibleAfter: serialize(f.visibleAfter),
        })),
      });
      factsAdded += c.facts.length;
    }
  }

  // Relationships — resolve character names to IDs, skip any that don't match
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

  // Glossary
  let glossaryAdded = 0;
  if (draft.glossary.length > 0) {
    await prisma.companionGlossaryTerm.createMany({
      data: draft.glossary.map((g) => ({
        companionId: companion.id,
        term: g.term,
        definition: g.definition,
        category: g.category,
        visibleAfter: serialize(g.visibleAfter),
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

// Prisma's Json columns accept plain objects; no transformation needed beyond
// stripping nulls-we-don't-want so the stored shape is clean.
function serialize(v: VisibleAfter): { seconds?: number; season?: number; episode?: number } {
  const out: { seconds?: number; season?: number; episode?: number } = {};
  if (typeof v.seconds === "number") out.seconds = v.seconds;
  if (typeof v.season === "number") out.season = v.season;
  if (typeof v.episode === "number") out.episode = v.episode;
  return out;
}

async function deleteSeasonSpecificContent(companionId: string, season: number) {
  // Postgres JSON path filter: visibleAfter->>'season' = '<season>'
  // Prisma doesn't have a type-safe way to do this, so we raw-delete.
  const seasonStr = String(season);
  await prisma.$executeRawUnsafe(
    `DELETE FROM companion_timeline_events WHERE companion_id = $1 AND visible_after->>'season' = $2`,
    companionId,
    seasonStr,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM companion_relationships WHERE companion_id = $1 AND visible_after->>'season' = $2`,
    companionId,
    seasonStr,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM companion_glossary_terms WHERE companion_id = $1 AND visible_after->>'season' = $2`,
    companionId,
    seasonStr,
  );
  // Characters: remove only ones that FIRST appeared in this season. Earlier-
  // season characters stay; their facts for this season get removed below.
  await prisma.$executeRawUnsafe(
    `DELETE FROM companion_characters WHERE companion_id = $1 AND visible_after->>'season' = $2`,
    companionId,
    seasonStr,
  );
  // Facts: remove facts tagged for this season regardless of which character
  // (Prisma cascade already removed facts for deleted characters above).
  await prisma.$executeRawUnsafe(
    `DELETE FROM companion_facts f
     USING companion_characters c
     WHERE f.character_id = c.id
       AND c.companion_id = $1
       AND f.visible_after->>'season' = $2`,
    companionId,
    seasonStr,
  );
}
