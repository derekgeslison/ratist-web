// Auto-promote characters whose visibleAfter sits later than a
// relationship they're part of.
//
// Why: relationships only render in WatchCompanionView when BOTH of
// their endpoint characters are unlocked. A relationship correctly
// timed to 8:15 silently disappears until ~15:00 if one of its
// characters is timed to 15:00. The admin form shows the
// relationship's own visibleAfter, hiding the gate — so admins (and
// AI-generated content) have to be told about it the hard way.
//
// This helper enforces the invariant: relationship.visibleAfter is
// the LATEST any of its characters' visibleAfter can be. When a
// character is "later" we lower it to match the relationship.
// Re-running is safe; idempotent.

import { prisma } from "@/lib/prisma";

interface VA {
  seconds?: number | null;
  season?: number | null;
  episode?: number | null;
}

// Order-preserving rank for { season, episode, seconds }. Movies have
// season/episode null and compare on seconds alone. TV uses lexicographic
// (season, episode, seconds). Returns +inf for malformed data so we never
// claim "unknown is earlier than known".
function rank(va: VA): number {
  const s = typeof va.season === "number" ? va.season : 0;
  const e = typeof va.episode === "number" ? va.episode : 0;
  const sec = typeof va.seconds === "number" ? va.seconds : 0;
  // Season weight comfortably exceeds any plausible episode * episode-weight.
  return s * 1e9 + e * 1e6 + sec;
}

/**
 * After a relationship is created or updated, lower its from/to
 * characters' visibleAfter values to match if they're currently
 * later. Quiet no-op when characters are already early enough,
 * the relationship is missing, or visibleAfter is malformed.
 */
export async function promoteCharactersForRelationship(relationshipId: string): Promise<void> {
  const rel = await prisma.companionRelationship.findUnique({
    where: { id: relationshipId },
    select: {
      visibleAfter: true,
      fromCharacterId: true,
      toCharacterId: true,
    },
  });
  if (!rel) return;
  const relVA = rel.visibleAfter as VA;
  if (relVA == null || typeof relVA !== "object") return;

  const chars = await prisma.companionCharacter.findMany({
    where: { id: { in: [rel.fromCharacterId, rel.toCharacterId] } },
    select: { id: true, visibleAfter: true },
  });

  const relRank = rank(relVA);
  for (const char of chars) {
    const charVA = char.visibleAfter as VA;
    if (charVA == null || typeof charVA !== "object") continue;
    if (rank(charVA) > relRank) {
      await prisma.companionCharacter.update({
        where: { id: char.id },
        data: { visibleAfter: relVA as object },
      });
    }
  }
}

/**
 * Sweep an entire companion: for every relationship, ensure both
 * endpoint characters' visibleAfter values are no later than the
 * relationship's. Used by the AI generation post-process and the
 * one-time backfill script. Single pass — character promotions can't
 * cascade because the only thing we look at is the original
 * relationship→character pairing.
 */
export async function promoteCharactersForCompanion(companionId: string): Promise<{ relationshipsScanned: number; charactersUpdated: number }> {
  const relationships = await prisma.companionRelationship.findMany({
    where: { companionId },
    select: { id: true, visibleAfter: true, fromCharacterId: true, toCharacterId: true },
  });
  if (relationships.length === 0) return { relationshipsScanned: 0, charactersUpdated: 0 };

  const charIds = new Set<string>();
  for (const r of relationships) {
    charIds.add(r.fromCharacterId);
    charIds.add(r.toCharacterId);
  }
  const chars = await prisma.companionCharacter.findMany({
    where: { id: { in: Array.from(charIds) } },
    select: { id: true, visibleAfter: true },
  });
  const charMap = new Map<string, VA>(chars.map((c) => [c.id, c.visibleAfter as VA]));

  // Compute the earliest required visibleAfter per character across all
  // their relationships. Apply at most one update per character.
  const required = new Map<string, VA>();
  for (const r of relationships) {
    const relVA = r.visibleAfter as VA;
    if (relVA == null || typeof relVA !== "object") continue;
    const rRank = rank(relVA);
    for (const charId of [r.fromCharacterId, r.toCharacterId]) {
      const existing = required.get(charId);
      if (!existing || rank(existing) > rRank) {
        required.set(charId, relVA);
      }
    }
  }

  let updated = 0;
  for (const [charId, neededVA] of required.entries()) {
    const currentVA = charMap.get(charId);
    if (!currentVA) continue;
    if (rank(currentVA) > rank(neededVA)) {
      await prisma.companionCharacter.update({
        where: { id: charId },
        data: { visibleAfter: neededVA as object },
      });
      updated++;
    }
  }

  return { relationshipsScanned: relationships.length, charactersUpdated: updated };
}
