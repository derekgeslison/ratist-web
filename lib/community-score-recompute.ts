// Recomputes Movie.ratistAvg / TVShow.ratistAvg after a rating mutates.
//
// Called fire-and-forget from the rate routes — same pattern as
// rebuildUserProfile and checkBadges. A failure here doesn't block
// the rate's response; worst case the column lags one rating behind
// until the next rate triggers another recompute.
//
// We compute over `ratistRating IS NOT NULL` which excludes drafts
// (drafts leave ratistRating null). Includes basic/quick ratings AND
// full standard/critic ratings — both have a ratistRating value.
// `excluded: false` keeps admin-flagged review-bomb ratings out of
// the public-facing community average.

import "server-only";
import { prisma } from "@/lib/prisma";

export async function recomputeRatistAvgForMovie(movieId: string): Promise<void> {
  const agg = await prisma.movieRating.aggregate({
    where: { movieId, ratistRating: { not: null }, excluded: false },
    _avg: { ratistRating: true },
    _count: { ratistRating: true },
  });
  await prisma.movie.update({
    where: { id: movieId },
    data: {
      ratistAvg: agg._avg.ratistRating,
      ratistCount: agg._count.ratistRating,
    },
  });
}

export async function recomputeRatistAvgForTvShow(tvShowId: string): Promise<void> {
  const agg = await prisma.tVShowRating.aggregate({
    // Series-scope only — per-season ratings stay out so the show's
    // "community average" reflects opinions of the whole series.
    where: { tvShowId, ratistRating: { not: null }, excluded: false, ratingScope: "series" },
    _avg: { ratistRating: true },
    _count: { ratistRating: true },
  });
  await prisma.tVShow.update({
    where: { id: tvShowId },
    data: {
      ratistAvg: agg._avg.ratistRating,
      ratistCount: agg._count.ratistRating,
    },
  });
}
