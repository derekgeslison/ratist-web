/**
 * Server-side validation of actorName / actorTmdbId pairs the AI
 * returns on character drafts. The AI is told to copy the tmdbId
 * verbatim from the cast list, but it occasionally mismatches —
 * particularly on long casts where the LLM gets lazy with opaque
 * numeric ids and assigns one cast member's id to another.
 *
 * Both the rendered avatar image AND the click-through link on a
 * character card key off actorTmdbId, so a wrong id sends users to
 * the wrong celebrity. This helper is the failsafe: trust the name,
 * fix the id from the cast list before persist.
 *
 * Strategy:
 *   1. Build a normalized name → tmdbId lookup from the cast.
 *   2. For each (actorName, actorTmdbId) the AI returned, look up
 *      the canonical id by name.
 *   3. If the canonical id differs from what the AI gave, override
 *      the AI's id. Names not in the cast list are left alone (the
 *      AI may be referencing a guest star outside our top-N cast
 *      window — better to keep the AI's guess than null it out).
 *
 * Used by the persist path (per-generation) and by the backfill
 * script (one-shot retroactive correction across existing rows).
 */

import type { CompanionDraft, DraftCharacter, DraftCharacterActor } from "@/lib/ai/watch-companion-chunks/shared";

export interface CastMember {
  tmdbId: number;
  name: string;
}

export interface CorrectionLog {
  /** Lowercased actor name (for grouping). */
  name: string;
  /** Original (wrong) tmdbId from the AI. */
  from: number | null;
  /** Corrected tmdbId from the cast list. */
  to: number;
  /** Where in the draft the correction happened (for log readability). */
  source: "primary" | "actors[]";
  /** Character name on whose row the correction landed. */
  characterName: string;
}

export interface CorrectionResult {
  draft: CompanionDraft;
  corrections: CorrectionLog[];
}

/** Normalize a name for case-insensitive cast lookup. */
function normalizeName(s: string): string {
  return s.toLowerCase().trim();
}

/** Build a name → tmdbId map from a cast list. First match wins on
 *  duplicate names (rare but possible on shows that recast a name).
 *  Same actor referenced multiple times collapses to a single id. */
function buildNameIndex(cast: CastMember[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of cast) {
    const key = normalizeName(m.name);
    if (!map.has(key)) map.set(key, m.tmdbId);
  }
  return map;
}

/**
 * Validate and correct a single (actorName, actorTmdbId) pair against
 * the cast index. Returns the corrected pair plus a log entry when a
 * change happened.
 */
function correctPair(
  actorName: string | null,
  actorTmdbId: number | null,
  nameIndex: Map<string, number>,
): { actorName: string | null; actorTmdbId: number | null; corrected: { from: number | null; to: number } | null } {
  if (!actorName) return { actorName, actorTmdbId, corrected: null };
  const expected = nameIndex.get(normalizeName(actorName));
  if (expected === undefined) {
    // Name isn't in the cast list — leave AI's guess alone. Logging
    // here would be noise (guest stars happen on every show).
    return { actorName, actorTmdbId, corrected: null };
  }
  if (actorTmdbId === expected) return { actorName, actorTmdbId, corrected: null };
  return {
    actorName,
    actorTmdbId: expected,
    corrected: { from: actorTmdbId, to: expected },
  };
}

/**
 * Walk every character + their actors[] side-table entries, fix any
 * tmdbId mismatches, return a new draft + a list of corrections made.
 * Pure: input draft is not mutated.
 */
export function correctActorIds(draft: CompanionDraft, cast: CastMember[]): CorrectionResult {
  const nameIndex = buildNameIndex(cast);
  const corrections: CorrectionLog[] = [];

  const correctedCharacters: DraftCharacter[] = draft.characters.map((c) => {
    const primary = correctPair(c.actorName, c.actorTmdbId, nameIndex);
    if (primary.corrected) {
      corrections.push({
        name: normalizeName(c.actorName ?? ""),
        from: primary.corrected.from,
        to: primary.corrected.to,
        source: "primary",
        characterName: c.name,
      });
    }
    const correctedActors: DraftCharacterActor[] = (c.actors ?? []).map((a) => {
      const fix = correctPair(a.actorName, a.actorTmdbId, nameIndex);
      if (fix.corrected) {
        corrections.push({
          name: normalizeName(a.actorName),
          from: fix.corrected.from,
          to: fix.corrected.to,
          source: "actors[]",
          characterName: c.name,
        });
      }
      return { ...a, actorTmdbId: fix.actorTmdbId };
    });
    return {
      ...c,
      actorName: primary.actorName,
      actorTmdbId: primary.actorTmdbId,
      actors: correctedActors,
    };
  });

  return {
    draft: { ...draft, characters: correctedCharacters },
    corrections,
  };
}
