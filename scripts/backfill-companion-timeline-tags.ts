/**
 * Walks every CompanionTimelineEvent and wraps occurrences of character
 * names from the parent companion in ((Name)) markers — without
 * re-running the AI. Lets existing companions get the inline-pill UX
 * without a fresh, token-burning regen.
 *
 * Run with:
 *   npx tsx scripts/backfill-companion-timeline-tags.ts          # dry run, no writes
 *   npx tsx scripts/backfill-companion-timeline-tags.ts --commit # actually write the updates
 *
 * Heuristics:
 * - Match against c.name as a WHOLE WORD (\b boundaries) only — no
 *   Paul-inside-Paul-Atreides false positives because we sort
 *   characters by name length DESC and skip already-wrapped spans.
 * - Skip text inside an existing ((...)) pair so re-running the script
 *   is idempotent.
 * - Limit each character to N replacements per event (default: all
 *   occurrences) — keeps a 5-mention sentence from looking pill-spammy.
 *   (The current default is to wrap all; flip if it ends up gross.)
 * - Only consider characters in the same companionId AND the event's
 *   seasonNumber (or movies, where season is null on both).
 */

import { prisma } from "../lib/prisma";

const COMMIT = process.argv.includes("--commit");

interface CharacterName {
  id: string;
  name: string;
}

// Escape regex meta-chars in a character name so a "Mister X." doesn't
// blow up the matcher. Only \b boundaries + literal text.
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace whole-word occurrences of `name` in `text` with `((name))`,
// but only OUTSIDE existing ((...)) pairs. Tokenize by splitting on
// the existing markers, transform only the in-between chunks, then
// reassemble. Returns the new string + the count of replacements.
function wrapName(text: string, name: string): { next: string; replaced: number } {
  if (!name || name.length < 2) return { next: text, replaced: 0 };
  const re = new RegExp(`\\b${escapeForRegex(name)}\\b`, "g");
  const parts = text.split(/(\(\([^)]+\)\))/g);
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    // Even indices are non-marker chunks; odd indices are markers we
    // leave alone so already-wrapped names don't get double-wrapped.
    if (i % 2 === 0) {
      const before = parts[i];
      let count = 0;
      const after = before.replace(re, () => { count++; return `((${name}))`; });
      parts[i] = after;
      total += count;
    }
  }
  return { next: parts.join(""), replaced: total };
}

async function backfill() {
  const events = await prisma.companionTimelineEvent.findMany({
    select: {
      id: true,
      companionId: true,
      seasonNumber: true,
      description: true,
      characterIds: true,
    },
  });
  console.log(`Found ${events.length} timeline events.`);

  // Cache characters per (companionId, seasonNumber). For movies,
  // seasonNumber is null on both event and character; the where clause
  // handles that uniformly.
  const charCache = new Map<string, CharacterName[]>();
  async function charsFor(companionId: string, seasonNumber: number | null): Promise<CharacterName[]> {
    const key = `${companionId}|${seasonNumber ?? "null"}`;
    const cached = charCache.get(key);
    if (cached) return cached;
    const chars = await prisma.companionCharacter.findMany({
      where: { companionId, seasonNumber },
      select: { id: true, name: true },
    });
    // Sort by name length DESC so "Paul Atreides" gets matched before
    // "Paul" — otherwise the shorter name eats the longer mention.
    const sorted = [...chars].sort((a, b) => b.name.length - a.name.length);
    charCache.set(key, sorted);
    return sorted;
  }

  let scanned = 0;
  let updated = 0;
  let totalReplacements = 0;

  for (const ev of events) {
    scanned++;
    const chars = await charsFor(ev.companionId, ev.seasonNumber);
    if (chars.length === 0) continue;

    let next = ev.description;
    let replacedHere = 0;
    for (const c of chars) {
      const { next: after, replaced } = wrapName(next, c.name);
      next = after;
      replacedHere += replaced;
    }

    if (replacedHere === 0 || next === ev.description) continue;

    updated++;
    totalReplacements += replacedHere;

    if (COMMIT) {
      await prisma.companionTimelineEvent.update({
        where: { id: ev.id },
        data: { description: next },
      });
    }
    if (updated <= 10 || updated % 50 === 0) {
      console.log(`[${updated}] event ${ev.id}: ${replacedHere} replacement(s)`);
      console.log(`   was:  ${ev.description.slice(0, 140)}`);
      console.log(`   now:  ${next.slice(0, 140)}`);
    }
  }

  console.log("---");
  console.log(`Scanned: ${scanned}`);
  console.log(`Would update: ${updated} event(s) (${totalReplacements} marker(s))`);
  if (!COMMIT) {
    console.log("Dry run — re-run with --commit to write changes.");
  } else {
    console.log("Committed.");
  }
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
