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

// Positive integer or null/undefined. Used when copying seasonNumber from
// a suggestion payload — we never accept arbitrary strings or negatives.
function normSeasonNumber(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && v > 0 && Number.isFinite(v)) return Math.floor(v);
  return undefined; // leave the DB column alone
}

// Validates a nameAliases array on a character. Each entry must have a
// non-empty string name and a well-formed visibleAfter. Cap at 4 entries
// to match the generator's normalization.
function normNameAliases(v: unknown): Array<{ name: string; visibleAfter: VisibleAfter }> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Array<{ name: string; visibleAfter: VisibleAfter }> = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.slice(0, 120) : "";
    if (!name) continue;
    const va = isVisibleAfter(e.visibleAfter) ? e.visibleAfter : {};
    out.push({ name, visibleAfter: va });
    if (out.length >= 4) break;
  }
  return out;
}

// Same shape as normNameAliases but for groupHistory entries — { group,
// visibleAfter }. Cap at 4 entries to match the generator's normalization.
function normGroupHistory(v: unknown): Array<{ group: string; visibleAfter: VisibleAfter }> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Array<{ group: string; visibleAfter: VisibleAfter }> = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const group = typeof e.group === "string" ? e.group.slice(0, 80) : "";
    if (!group) continue;
    const va = isVisibleAfter(e.visibleAfter) ? e.visibleAfter : {};
    out.push({ group, visibleAfter: va });
    if (out.length >= 4) break;
  }
  return out;
}

export async function applySuggestion(suggestionId: string): Promise<void> {
  const suggestion = await prisma.companionSuggestion.findUnique({
    where: { id: suggestionId },
    select: { action: true, targetType: true, targetId: true, payload: true, companionId: true },
  });
  if (!suggestion) return;

  const { action, targetType, targetId, companionId } = suggestion;
  // Recap alternatives are never applied. They exist as community
  // alts under the canonical recap, ordered by upvote score; if an
  // admin wants one promoted they can copy it into the recap editor
  // by hand. Defensive guard in case the vote endpoint's no-auto-
  // apply gate is ever bypassed.
  if (targetType === "recap_installment" || targetType === "recap_series") return;
  const payload = (suggestion.payload ?? {}) as Record<string, unknown>;

  if (action === "remove") {
    if (!targetId) return;
    // Capture the row we're about to nuke so an admin can restore it
    // later via the Revert flow. Cascade-lost children (e.g. a character's
    // facts) aren't included — revert recreates just the top-level row.
    const snapshot = await captureItemSnapshot(targetType, targetId);
    await removeTarget(targetType, targetId);
    if (snapshot) {
      // Prisma's Json input wants a JsonObject — casting to unknown avoids
      // the strict structural type (snapshots can contain any of the
      // row's fields including nested Json like visibleAfter).
      await prisma.companionSuggestion.update({
        where: { id: suggestionId },
        data: { originalSnapshot: snapshot as unknown as object },
      });
    }
    return;
  }

  if (action === "edit") {
    if (!targetId) return;
    // Snapshot the fields we're about to overwrite before applying. Gives
    // the admin Revert action something to write back, and preserves the
    // original AI content even if community votes approve a bad edit.
    const snapshot = await captureItemSnapshot(targetType, targetId);
    await editTarget(targetType, targetId, payload);
    if (snapshot) {
      // Prisma's Json input wants a JsonObject — casting to unknown avoids
      // the strict structural type (snapshots can contain any of the
      // row's fields including nested Json like visibleAfter).
      await prisma.companionSuggestion.update({
        where: { id: suggestionId },
        data: { originalSnapshot: snapshot as unknown as object },
      });
    }
    return;
  }

  if (action === "add") {
    const createdId = await addTarget(targetType, companionId, payload);
    if (createdId) {
      await prisma.companionSuggestion.update({
        where: { id: suggestionId },
        data: { appliedItemId: createdId },
      });
    }
    return;
  }
}

/**
 * Reads the current DB state of a target item and returns a plain object
 * snapshot suitable for writing into CompanionSuggestion.originalSnapshot.
 * Returns null if the targetType isn't known or the row doesn't exist.
 * Snapshot fields are the same ones that editTarget/addTarget know about,
 * so the revert path can reuse the same logic to write them back.
 */
async function captureItemSnapshot(targetType: string, targetId: string): Promise<Record<string, unknown> | null> {
  switch (targetType) {
    case "baseDescription":
    case "character": {
      const c = await prisma.companionCharacter.findUnique({
        where: { id: targetId },
        select: {
          id: true, companionId: true, seasonNumber: true, name: true,
          actorName: true, actorTmdbId: true, baseDescription: true,
          visibleAfter: true, group: true, imageUrl: true, sortOrder: true,
          nameAliases: true, groupHistory: true,
        },
      });
      return c ? (c as unknown as Record<string, unknown>) : null;
    }
    case "fact": {
      const f = await prisma.companionFact.findUnique({
        where: { id: targetId },
        select: { id: true, characterId: true, fact: true, factType: true, visibleAfter: true },
      });
      return f ? (f as unknown as Record<string, unknown>) : null;
    }
    case "relationship": {
      const r = await prisma.companionRelationship.findUnique({
        where: { id: targetId },
        select: {
          id: true, companionId: true, seasonNumber: true,
          fromCharacterId: true, toCharacterId: true, relationshipType: true,
          label: true, directed: true, visibleAfter: true,
        },
      });
      return r ? (r as unknown as Record<string, unknown>) : null;
    }
    case "timeline": {
      const t = await prisma.companionTimelineEvent.findUnique({
        where: { id: targetId },
        select: {
          id: true, companionId: true, seasonNumber: true,
          description: true, importance: true, characterIds: true, visibleAfter: true,
        },
      });
      return t ? (t as unknown as Record<string, unknown>) : null;
    }
    case "glossary": {
      const g = await prisma.companionGlossaryTerm.findUnique({
        where: { id: targetId },
        select: {
          id: true, companionId: true, seasonNumber: true,
          term: true, definition: true, category: true, sortOrder: true, visibleAfter: true,
        },
      });
      return g ? (g as unknown as Record<string, unknown>) : null;
    }
  }
  return null;
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
      // Pair the tmdb id with actorName so an approved swap updates the
      // celebrity-page deep link too. Accept null to clear an outdated id.
      if (payload.actorTmdbId === null || typeof payload.actorTmdbId === "number") {
        data.actorTmdbId = payload.actorTmdbId;
      }
      if (visibleAfter) data.visibleAfter = visibleAfter;
      const season = normSeasonNumber(payload.seasonNumber);
      if (season !== undefined) data.seasonNumber = season;
      const aliases = normNameAliases(payload.nameAliases);
      if (aliases !== undefined) data.nameAliases = aliases;
      const groupHistory = normGroupHistory(payload.groupHistory);
      if (groupHistory !== undefined) data.groupHistory = groupHistory;
      if (Object.keys(data).length > 0) {
        const updated = await prisma.companionCharacter.update({ where: { id: targetId }, data });
        // Mirror the actor change into the lowest-sortOrder side-table
        // row. Front-end reads currentActor from actors[] first; without
        // this sync, an approved suggestion changes the primary fields
        // but the public page still renders the old actor (the same
        // failure we patched on the admin direct-PATCH route).
        const actorChanged = "actorName" in data || "actorTmdbId" in data;
        if (actorChanged && updated.actorName) {
          const earliestRow = await prisma.companionCharacterActor.findFirst({
            where: { characterId: targetId },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          });
          if (earliestRow) {
            await prisma.companionCharacterActor.update({
              where: { id: earliestRow.id },
              data: { actorName: updated.actorName, actorTmdbId: updated.actorTmdbId },
            });
          }
        }
      }
      return;
    }

    case "fact": {
      const data: Record<string, unknown> = {};
      const fact = str("fact", 400); if (fact) data.fact = fact;
      const factType = str("factType", 40); if (factType) data.factType = factType;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      // No seasonNumber on facts directly — they inherit via their parent
      // character, which admins edit via the character targetType.
      if (Object.keys(data).length > 0) await prisma.companionFact.update({ where: { id: targetId }, data });
      return;
    }

    case "relationship": {
      const data: Record<string, unknown> = {};
      const label = str("label", 80); if (label) data.label = label;
      const relationshipType = str("relationshipType", 40); if (relationshipType) data.relationshipType = relationshipType;
      if (typeof payload.directed === "boolean") data.directed = payload.directed;
      if (visibleAfter) data.visibleAfter = visibleAfter;
      const season = normSeasonNumber(payload.seasonNumber);
      if (season !== undefined) data.seasonNumber = season;
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
      const season = normSeasonNumber(payload.seasonNumber);
      if (season !== undefined) data.seasonNumber = season;
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
      const season = normSeasonNumber(payload.seasonNumber);
      if (season !== undefined) data.seasonNumber = season;
      if (Object.keys(data).length > 0) await prisma.companionGlossaryTerm.update({ where: { id: targetId }, data });
      return;
    }
  }
}

async function addTarget(targetType: string, companionId: string, payload: Record<string, unknown>): Promise<string | null> {
  const str = (k: string, max: number) => typeof payload[k] === "string" ? (payload[k] as string).slice(0, max) : null;
  const visibleAfter = isVisibleAfter(payload.visibleAfter) ? payload.visibleAfter : {};
  // seasonNumber comes from the payload when the suggesting user is on a
  // TV companion with a season selected. Null for movies, and for TV
  // suggestions that didn't specify (admin may need to correct).
  const seasonNumberRaw = normSeasonNumber(payload.seasonNumber);
  const seasonNumber = seasonNumberRaw === undefined ? null : seasonNumberRaw;

  switch (targetType) {
    case "character": {
      const name = str("name", 120);
      const baseDescription = str("baseDescription", 600);
      if (!name || !baseDescription) return null;
      const nameAliases = normNameAliases(payload.nameAliases) ?? [];
      const groupHistory = normGroupHistory(payload.groupHistory) ?? [];
      // Append at the end of the cast list (per season for TV) so
      // community-added characters don't shove in at position two next to
      // the lead. sortOrder is asc in the viewer; take max+1 within the
      // scope we care about.
      const last = await prisma.companionCharacter.findFirst({
        where: { companionId, seasonNumber },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const created = await prisma.companionCharacter.create({
        data: {
          companionId,
          seasonNumber,
          name,
          baseDescription,
          actorName: str("actorName", 120),
          actorTmdbId: typeof payload.actorTmdbId === "number" ? payload.actorTmdbId : null,
          group: str("group", 80),
          visibleAfter,
          nameAliases: nameAliases.length > 0 ? nameAliases : undefined,
          groupHistory: groupHistory.length > 0 ? groupHistory : undefined,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      return created.id;
    }

    case "fact": {
      const characterId = str("characterId", 60);
      const fact = str("fact", 400);
      const factType = str("factType", 40) ?? "other";
      if (!characterId || !fact) return null;
      // Facts aren't season-scoped on their own row — they inherit via the
      // parent character. Just confirm the character exists so we don't
      // orphan a fact.
      const parent = await prisma.companionCharacter.findUnique({ where: { id: characterId }, select: { id: true } });
      if (!parent) return null;
      const created = await prisma.companionFact.create({
        data: { characterId, fact, factType, visibleAfter },
      });
      return created.id;
    }

    case "relationship": {
      const fromCharacterId = str("fromCharacterId", 60);
      const toCharacterId = str("toCharacterId", 60);
      const relationshipType = str("relationshipType", 40) ?? "other";
      const label = str("label", 80);
      if (!fromCharacterId || !toCharacterId || !label) return null;
      if (fromCharacterId === toCharacterId) return null;
      const created = await prisma.companionRelationship.create({
        data: {
          companionId, seasonNumber,
          fromCharacterId, toCharacterId, relationshipType, label,
          directed: payload.directed !== false,
          visibleAfter,
        },
      });
      return created.id;
    }

    case "timeline": {
      const description = str("description", 500);
      if (!description) return null;
      const created = await prisma.companionTimelineEvent.create({
        data: {
          companionId, seasonNumber,
          description,
          characterIds: Array.isArray(payload.characterIds) ? payload.characterIds.filter((id): id is string => typeof id === "string") : [],
          importance: typeof payload.importance === "number" ? Math.max(1, Math.min(5, Math.floor(payload.importance))) : 3,
          visibleAfter,
        },
      });
      return created.id;
    }

    case "glossary": {
      const term = str("term", 80);
      const definition = str("definition", 500);
      if (!term || !definition) return null;
      // Append at the end of the glossary list so user-added terms don't
      // disrupt the AI's most-obscure-first ordering.
      const last = await prisma.companionGlossaryTerm.findFirst({
        where: { companionId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const created = await prisma.companionGlossaryTerm.create({
        data: {
          companionId, seasonNumber,
          term, definition,
          category: str("category", 40),
          visibleAfter,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      });
      return created.id;
    }
  }
  return null;
}
