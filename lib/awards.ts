/**
 * awards.ts
 *
 * Server-side data fetching functions for displaying awards on detail pages.
 */

import { prisma } from "@/lib/prisma";

export interface AwardNominationDisplay {
  id: string;
  categoryName: string;
  categorySlug: string;
  year: number | null;
  ceremony: string | null;
  isWinner: boolean;
  /** For celebrity awards: the film they won for */
  forWork?: { tmdbId: number; title: string; posterPath: string | null } | null;
  /** For movie/show awards: the person who won */
  person?: { tmdbId: number; name: string } | null;
}

export interface AwardBodyGroup {
  slug: string;
  name: string;
  shortName: string;
  winCount: number;
  nomCount: number;
  nominations: AwardNominationDisplay[];
}

/**
 * Strip the award body prefix from a category name to avoid redundancy.
 * e.g. "Academy Award for Best Picture" → "Best Picture"
 *      "Golden Globe Award for Best Motion Picture" → "Best Motion Picture"
 *      "Primetime Emmy Award for Outstanding Drama Series" → "Outstanding Drama Series"
 */
function shortenCategoryName(categoryName: string, bodyName: string, shortName: string): string {
  // Common patterns: "Academy Award for ...", "Golden Globe Award for ...", "Primetime Emmy Award for ..."
  const prefixes = [
    `${shortName} for `,       // "Oscar for ..."
    `${bodyName} for `,        // "Academy Awards for ..." (unlikely but safe)
  ];

  // Also handle singular forms: "Academy Award for ...", "Golden Globe Award for ..."
  const singularBody = bodyName.replace(/Awards?$/, "Award");
  prefixes.push(`${singularBody} for `);

  // Handle "Primetime Emmy Award" specifically
  if (shortName === "Emmy") {
    prefixes.push("Primetime Emmy Award for ");
    prefixes.push("Emmy Award for ");
  }

  for (const prefix of prefixes) {
    if (categoryName.startsWith(prefix)) {
      const shortened = categoryName.slice(prefix.length);
      // Don't return empty or generic results
      if (shortened && shortened.toLowerCase() !== "awards" && shortened.toLowerCase() !== "award") {
        return shortened;
      }
    }
  }

  // Fallback: if the category name starts with the short name, strip it
  if (categoryName.startsWith(`${shortName} `)) {
    const shortened = categoryName.slice(shortName.length + 1);
    if (shortened && shortened.toLowerCase() !== "awards" && shortened.toLowerCase() !== "award") {
      return shortened;
    }
  }

  // For "Other Awards" bucket or generic awards, keep the full original name
  return categoryName;
}

async function groupAwards(
  nominations: {
    id: string;
    isWinner: boolean;
    year: number | null;
    ceremony: string | null;
    category: { slug: string; name: string; awardBody: { slug: string; name: string; shortName: string } };
    celebrity?: { tmdbId: number; name: string } | null;
    forMovie?: { tmdbId: number; title: string; posterPath: string | null } | null;
    movie?: { tmdbId: number; title: string; posterPath: string | null } | null;
  }[]
): Promise<AwardBodyGroup[]> {
  const bodyMap = new Map<string, AwardBodyGroup>();

  for (const nom of nominations) {
    const body = nom.category.awardBody;
    let group = bodyMap.get(body.slug);
    if (!group) {
      group = { slug: body.slug, name: body.name, shortName: body.shortName, winCount: 0, nomCount: 0, nominations: [] };
      bodyMap.set(body.slug, group);
    }

    if (nom.isWinner) group.winCount++;
    group.nomCount++;

    group.nominations.push({
      id: nom.id,
      categoryName: shortenCategoryName(nom.category.name, body.name, body.shortName),
      categorySlug: nom.category.slug,
      year: nom.year,
      ceremony: nom.ceremony,
      isWinner: nom.isWinner,
      forWork: nom.forMovie ?? nom.movie ?? undefined,
      person: nom.celebrity ?? undefined,
    });
  }

  // Sort: most prestigious first (Oscar > Golden Globe > BAFTA > ...)
  const bodyOrder = ["oscar", "golden-globe", "bafta", "sag", "cannes", "emmy", "critics-choice", "venice", "berlin", "indie-spirit", "dga", "wga", "pga", "peabody", "saturn", "tca", "satellite", "annie", "gotham", "afi", "other"];
  const groups = [...bodyMap.values()].sort((a, b) => {
    const aIdx = bodyOrder.indexOf(a.slug);
    const bIdx = bodyOrder.indexOf(b.slug);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // Sort nominations within each group by year descending
  for (const group of groups) {
    group.nominations.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }

  return groups;
}

// ─── Movie awards ───────────────────────────────────────────────────────────

export async function getMovieAwards(movieId: string): Promise<AwardBodyGroup[]> {
  const nominations = await prisma.awardNomination.findMany({
    where: { movieId },
    include: {
      category: { include: { awardBody: true } },
      celebrity: { select: { tmdbId: true, name: true } },
    },
    orderBy: { year: "desc" },
  });

  return groupAwards(nominations);
}

// ─── TV show awards ─────────────────────────────────────────────────────────

export async function getTVShowAwards(tvShowId: string): Promise<AwardBodyGroup[]> {
  const nominations = await prisma.awardNomination.findMany({
    where: { tvShowId },
    include: {
      category: { include: { awardBody: true } },
      celebrity: { select: { tmdbId: true, name: true } },
    },
    orderBy: { year: "desc" },
  });

  return groupAwards(nominations);
}

// ─── Celebrity awards ───────────────────────────────────────────────────────

export async function getCelebrityAwards(celebrityId: string): Promise<AwardBodyGroup[]> {
  const nominations = await prisma.awardNomination.findMany({
    where: { celebrityId },
    include: {
      category: { include: { awardBody: true } },
      forMovie: { select: { tmdbId: true, title: true, posterPath: true } },
    },
    orderBy: { year: "desc" },
  });

  return groupAwards(nominations);
}
