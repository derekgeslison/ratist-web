/**
 * Read-only inspection of an actively-airing companion's content. Reports
 * the visibleAfter distribution across episodes so we can see whether the
 * AI emitted distributed content or parked everything at episode 1.
 *
 * Usage:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/inspect-airing-companion.ts <tmdbId> <season>
 *
 * Example (The Boys season 5):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/inspect-airing-companion.ts 76479 5
 */

import { prisma } from "../lib/prisma";

interface VA { seconds?: number | null; season?: number | null; episode?: number | null }

function epOf(v: unknown): number | null {
  if (!v || typeof v !== "object") return null;
  const e = (v as VA).episode;
  return typeof e === "number" && e > 0 ? Math.floor(e) : null;
}

async function main() {
  const tmdbIdRaw = process.argv[2];
  const seasonRaw = process.argv[3];
  const tmdbId = parseInt(tmdbIdRaw ?? "", 10);
  const season = parseInt(seasonRaw ?? "", 10);
  if (!Number.isFinite(tmdbId) || tmdbId < 1 || !Number.isFinite(season) || season < 1) {
    console.error("Usage: ... scripts/inspect-airing-companion.ts <tmdbId> <season>");
    process.exit(1);
  }

  const companion = await prisma.watchCompanion.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: "tv" } },
    select: {
      id: true,
      title: true,
      seasonsGenerated: true,
      airingSeasons: { select: { seasonNumber: true, episodesGenerated: true, status: true, failureCount: true, lastError: true, lastSweepAt: true } },
    },
  });
  if (!companion) {
    console.error("No companion found for tmdbId", tmdbId);
    process.exit(1);
  }

  console.log(`\n=== ${companion.title} (companionId ${companion.id}) ===`);
  console.log(`seasonsGenerated: [${companion.seasonsGenerated.join(", ")}]`);
  console.log(`airingSeasons:`);
  for (const a of companion.airingSeasons) {
    console.log(`  - S${a.seasonNumber} ${a.status} — episodesGenerated [${a.episodesGenerated.join(", ")}] failureCount=${a.failureCount} lastSweepAt=${a.lastSweepAt?.toISOString() ?? "never"}`);
    if (a.lastError) console.log(`    lastError: ${a.lastError}`);
  }

  const [chars, facts, rels, tl, gloss] = await Promise.all([
    prisma.companionCharacter.findMany({
      where: { companionId: companion.id, seasonNumber: season },
      select: { name: true, visibleAfter: true },
    }),
    prisma.companionFact.findMany({
      where: { character: { companionId: companion.id, seasonNumber: season } },
      select: { fact: true, visibleAfter: true },
    }),
    prisma.companionRelationship.findMany({
      where: { companionId: companion.id, seasonNumber: season },
      select: { label: true, visibleAfter: true },
    }),
    prisma.companionTimelineEvent.findMany({
      where: { companionId: companion.id, seasonNumber: season },
      select: { description: true, visibleAfter: true },
    }),
    prisma.companionGlossaryTerm.findMany({
      where: { companionId: companion.id, seasonNumber: season },
      select: { term: true, visibleAfter: true },
    }),
  ]);

  function bucket(label: string, rows: Array<{ visibleAfter: unknown }>) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const ep = epOf(r.visibleAfter);
      const key = ep === null ? "null/missing" : `E${ep}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = rows.length;
    console.log(`\n  ${label} (${total} total):`);
    const sorted = Array.from(counts.entries()).sort((a, b) => {
      // null first, then numeric ascending
      if (a[0] === "null/missing") return -1;
      if (b[0] === "null/missing") return 1;
      return parseInt(a[0].slice(1), 10) - parseInt(b[0].slice(1), 10);
    });
    for (const [key, count] of sorted) {
      const bar = "█".repeat(Math.round((count / total) * 40));
      console.log(`    ${key.padStart(13)}: ${String(count).padStart(3)} ${bar}`);
    }
  }

  console.log(`\n=== visibleAfter distribution for S${season} ===`);
  bucket("Characters", chars);
  bucket("Facts", facts);
  bucket("Relationships", rels);
  bucket("Timeline events", tl);
  bucket("Glossary", gloss);

  // Show 5 example rows from each bucket (most-helpful for spotting patterns).
  console.log(`\n=== Sample timeline events (showing first 8) ===`);
  for (const t of tl.slice(0, 8)) {
    const ep = epOf(t.visibleAfter);
    const va = JSON.stringify(t.visibleAfter);
    console.log(`  E${ep ?? "?"} | ${t.description.slice(0, 110)}`);
    console.log(`         visibleAfter: ${va}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
