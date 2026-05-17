// Resolve the "community score" displayed on poster tiles. TMDB's
// voteAverage is the primary source (it has crowd data for nearly every
// title); Ratist's own community average (`ratistAvg`) fills in for
// titles TMDB hasn't aggregated yet — obscure releases, very new films,
// or anything where TMDB returns 0.
//
// Today only the profile-page surfaces (ProfileTabs sections) consume
// this — they pass both fields through ProfileTabsLoader. Sitewide
// adoption (MovieCard, ShowCard, every list) is tracked as a follow-up
// because those receive TMDBMovie objects from the TMDB API directly
// and don't currently have access to our DB-side ratistAvg without an
// enrichment step.
//
// Maintained by the rate routes via recomputeRatistAvgForMovie /
// recomputeRatistAvgForTvShow — see lib/community-score-recompute.ts.

export function resolveCommunityScore(
  voteAverage: number | null | undefined,
  ratistAvg: number | null | undefined,
): number | null {
  if (voteAverage != null && voteAverage > 0) return voteAverage;
  if (ratistAvg != null && ratistAvg > 0) return ratistAvg;
  return null;
}
