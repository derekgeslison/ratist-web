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
      categoryName: nom.category.name,
      categorySlug: nom.category.slug,
      year: nom.year,
      ceremony: nom.ceremony,
      isWinner: nom.isWinner,
      forWork: nom.forMovie ?? nom.movie ?? undefined,
      person: nom.celebrity ?? undefined,
    });
  }

  // Sort: most prestigious first (Oscar > Golden Globe > BAFTA > ...)
  const bodyOrder = ["oscar", "golden-globe", "bafta", "sag", "cannes", "emmy", "critics-choice", "venice", "berlin", "indie-spirit"];
  const groups = [...bodyMap.values()].sort((a, b) => {
    const aIdx = bodyOrder.indexOf(a.slug);
    const bIdx = bodyOrder.indexOf(b.slug);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // Sort nominations within each group: wins first, then by year descending
  for (const group of groups) {
    group.nominations.sort((a, b) => {
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      return (b.year ?? 0) - (a.year ?? 0);
    });
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
