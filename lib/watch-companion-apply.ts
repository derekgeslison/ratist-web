// Applies an approved CompanionSuggestion to the live companion data.
// Payload shapes are validated per targetType; anything unexpected is a
// no-op so bad suggestions can't corrupt published data.

import { prisma } from "@/lib/prisma";

// Prisma's Json input is happier with a plain indexed record than a named
// interface with optional fields.
type VisibleAfter = Record<string, number>;

function isVisibleAfter(v: unknown): v is VisibleAfter {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const ok = (k: string) => o[k] === undefined || (typeof o[k] === "number" && (o[k] as number) >= 0);
  return ok("seconds") && ok("season") && ok("episode");
}

export async function applySuggestion(suggestionId: string): Promise<void> {
  const suggestion = await prisma.companionSuggestion.findUnique({
    where: { id: suggestionId },
    select: { action: true, targetType: true, targetId: true, payload: true, companionId: true },
  });
  if (!suggestion) return;

  const { action, targetType, targetId, companionId } = suggestion;
  const payload = (suggestion.payload ?? {}) as Record<string, unknown>;

  if (action === "remove") {
    if (!targetId) return;
    await removeTarget(targetType, targetId);
    return;
  }

  if (action === "edit") {
    if (!targetId) return;
    await editTarget(targetType, targetId, payload);
    return;
  }

  if (action === "add") {
    await addTarget(targetType, companionId, payload);
    return;
  }
}

async function removeTarget(targetType: string, targetId: string) {
  switch (targetType) {
    case "character": await prisma.companionCharacter.deleteMany({ where: { id: targetId } }); return;
    case "fact":      await prisma.companionFact.deleteMany({ where: { id: targetId } }); return;
    case "relationship": await prisma.companionRelationship.deleteMany({ where: { id: targetId } }); return;
    case "timeline":  await prisma.companionTimelineEvent.deleteMany({ where: { id: targetId } }); return;
    case "glossary":  await prisma.companionGlossaryTerm.deleteMany({ where: { id: targetId } }); return;
  }
}

async function editTarget(targetType: string, targetId: string, payload: Record<string, unknown>) {
  const str = (k: string, max: number) => typeof payload[k] === "string" ? (payload[k] as string).slice(0, max) : undefined;
  const visibleAfter = isVisibleAfter(payload.visibleAfter) ? payload.visibleAfter : undefined;

  switch (targetType) {
    case "baseDescription":
      // Special alias: edit a character's baseDescription only
      if (typeof payload.baseDescription === "string") {
        await prisma.companionCharacter.update({
          where: { id: targetId },
          data: { baseDescription: (payload.baseDescription as string).slice(0, 600) },
        });
      }
      return;

    case "character": {
      const data: Record<string, unknown> = {};
      const name = str("name", 120); if (name) data.name = name;
      const baseDescription = str("baseDescription", 600); if (baseDescription) data.baseDescription = baseDescription;
      const group = typeof payload.group === "string" ? (payload.group as string).slice(0, 80) : payload.group === null ? null : undefined;
      if (group !== undefined) data.group = group;
      const actorName = typeof payload.actorName === "string" ? (payload.actorName as string).slice(0, 120) : undefined;
      if (actorName !== undefined) data.actorName = actorName;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      if (Object.keys(data).length > 0) await prisma.companionCharacter.update({ where: { id: targetId }, data });
      return;
    }

    case "fact": {
      const data: Record<string, unknown> = {};
      const fact = str("fact", 400); if (fact) data.fact = fact;
      const factType = str("factType", 40); if (factType) data.factType = factType;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      if (Object.keys(data).length > 0) await prisma.companionFact.update({ where: { id: targetId }, data });
      return;
    }

    case "relationship": {
      const data: Record<string, unknown> = {};
      const label = str("label", 80); if (label) data.label = label;
      const relationshipType = str("relationshipType", 40); if (relationshipType) data.relationshipType = relationshipType;
      if (typeof payload.directed === "boolean") data.directed = payload.directed;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      if (Object.keys(data).length > 0) await prisma.companionRelationship.update({ where: { id: targetId }, data });
      return;
    }

    case "timeline": {
      const data: Record<string, unknown> = {};
      const description = str("description", 500); if (description) data.description = description;
      if (typeof payload.importance === "number" && payload.importance >= 1 && payload.importance <= 5) {
        data.importance = Math.floor(payload.importance);
      }
      if (visibleAfter) data.visibleAfter = visibleAfter;
      if (Object.keys(data).length > 0) await prisma.companionTimelineEvent.update({ where: { id: targetId }, data });
      return;
    }

    case "glossary": {
      const data: Record<string, unknown> = {};
      const term = str("term", 80); if (term) data.term = term;
      const definition = str("definition", 500); if (definition) data.definition = definition;
      const category = typeof payload.category === "string" ? (payload.category as string).slice(0, 40) : payload.category === null ? null : undefined;
      if (category !== undefined) data.category = category;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      if (Object.keys(data).length > 0) await prisma.companionGlossaryTerm.update({ where: { id: targetId }, data });
      return;
    }
  }
}

async function addTarget(targetType: string, companionId: string, payload: Record<string, unknown>) {
  const str = (k: string, max: number) => typeof payload[k] === "string" ? (payload[k] as string).slice(0, max) : null;
  const visibleAfter = isVisibleAfter(payload.visibleAfter) ? payload.visibleAfter : {};

  switch (targetType) {
    case "character": {
      const name = str("name", 120);
      const baseDescription = str("baseDescription", 600);
      if (!name || !baseDescription) return;
      await prisma.companionCharacter.create({
        data: {
          companionId,
          name,
          baseDescription,
          actorName: str("actorName", 120),
          actorTmdbId: typeof payload.actorTmdbId === "number" ? payload.actorTmdbId : null,
          group: str("group", 80),
          visibleAfter,
        },
      });
      return;
    }

    case "fact": {
      const characterId = str("characterId", 60);
      const fact = str("fact", 400);
      const factType = str("factType", 40) ?? "other";
      if (!characterId || !fact) return;
      await prisma.companionFact.create({
        data: { characterId, fact, factType, visibleAfter },
      });
      return;
    }

    case "relationship": {
      const fromCharacterId = str("fromCharacterId", 60);
      const toCharacterId = str("toCharacterId", 60);
      const relationshipType = str("relationshipType", 40) ?? "other";
      const label = str("label", 80);
      if (!fromCharacterId || !toCharacterId || !label) return;
      await prisma.companionRelationship.create({
        data: {
          companionId, fromCharacterId, toCharacterId, relationshipType, label,
          directed: payload.directed !== false,
          visibleAfter,
        },
      });
      return;
    }

    case "timeline": {
      const description = str("description", 500);
      if (!description) return;
      await prisma.companionTimelineEvent.create({
        data: {
          companionId,
          description,
          characterIds: Array.isArray(payload.characterIds) ? payload.characterIds.filter((id): id is string => typeof id === "string") : [],
          importance: typeof payload.importance === "number" ? Math.max(1, Math.min(5, Math.floor(payload.importance))) : 3,
          visibleAfter,
        },
      });
      return;
    }

    case "glossary": {
      const term = str("term", 80);
      const definition = str("definition", 500);
      if (!term || !definition) return;
      await prisma.companionGlossaryTerm.create({
        data: {
          companionId, term, definition,
          category: str("category", 40),
          visibleAfter,
        },
      });
      return;
    }
  }
}
