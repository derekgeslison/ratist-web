import { prisma } from "./prisma";
import { upscaleProfile, dimensionSimilarity, matchScore } from "./ratings";

/**
 * Rebuilds a user's persona profile from all their ratings.
 * Called after every new/edited rating.
 */
export async function rebuildUserProfile(userId: string) {
  const ratings = await prisma.movieRating.findMany({
    where: { userId },
    include: { movie: true },
  });

  if (ratings.length === 0) return;

  // Get community averages for each movie
  const movieIds = ratings.map((r) => r.movieId);
  const communityAvgs = await prisma.movieRating.groupBy({
    by: ["movieId"],
    where: { movieId: { in: movieIds } },
    _avg: {
      storyScore: true,
      styleScore: true,
      emotiveScore: true,
      actingScore: true,
      entertainScore: true,
      ratistRating: true,
    },
  });
  const communityMap = new Map(communityAvgs.map((c) => [c.movieId, c._avg]));

  // Component preference accumulators
  const components = {
    plotFocused: [] as number[],
    visualFocused: [] as number[],
    scriptFocused: [] as number[],
    actingFocused: [] as number[],
    originalityFocused: [] as number[],
    characterFocused: [] as number[],
    messageFocused: [] as number[],
  };

  // Genre preference accumulators (from highly-rated movies)
  const genres = {
    genreAction: [] as number[],
    genreHorror: [] as number[],
    genreDrama: [] as number[],
    genreHistorical: [] as number[],
    genreScifi: [] as number[],
    genreThriller: [] as number[],
    genreComedy: [] as number[],
    genreBookAdapt: [] as number[],
    genreFantasy: [] as number[],
    genreRomance: [] as number[],
    genreDocumentary: [] as number[],
    genreFamily: [] as number[],
    genreFilmNoir: [] as number[],
    genreMusical: [] as number[],
    genreBiopic: [] as number[],
    genreCrime: [] as number[],
    genreWestern: [] as number[],
    genreMystery: [] as number[],
  };

  const THRESHOLD = 8.5;

  for (const rating of ratings) {
    const overall = rating.overallRating ?? rating.ratistRating ?? 0;
    if (overall < THRESHOLD) continue; // Only use highly-rated movies for persona

    const community = communityMap.get(rating.movieId);

    function componentScore(
      userScore: number | null,
      communityScore: number | null | undefined
    ): number {
      if (userScore == null) return 0;
      const activated =
        (communityScore != null && communityScore >= THRESHOLD) || userScore >= THRESHOLD;
      return activated ? overall : 0;
    }

    components.plotFocused.push(componentScore(rating.storyScore, community?.storyScore));
    components.visualFocused.push(componentScore(rating.styleScore, community?.styleScore));
    components.scriptFocused.push(componentScore(rating.actingScore, community?.actingScore));
    components.actingFocused.push(componentScore(rating.actingScore, community?.actingScore));
    components.originalityFocused.push(componentScore(rating.storyScore, community?.storyScore));
    components.characterFocused.push(componentScore(rating.storyScore, community?.storyScore));
    components.messageFocused.push(componentScore(rating.emotiveScore, community?.emotiveScore));

    // Genre scores from this highly-rated movie
    for (const key of Object.keys(genres) as (keyof typeof genres)[]) {
      const val = rating[key as keyof typeof rating] as number | null;
      if (val != null) genres[key].push(val);
    }
  }

  function avgArr(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  const rawProfile = {
    plotFocused: avgArr(components.plotFocused),
    visualFocused: avgArr(components.visualFocused),
    scriptFocused: avgArr(components.scriptFocused),
    actingFocused: avgArr(components.actingFocused),
    originalityFocused: avgArr(components.originalityFocused),
    characterFocused: avgArr(components.characterFocused),
    messageFocused: avgArr(components.messageFocused),
  };

  const rawGenres = {
    genreAction: avgArr(genres.genreAction),
    genreHorror: avgArr(genres.genreHorror),
    genreDrama: avgArr(genres.genreDrama),
    genreHistorical: avgArr(genres.genreHistorical),
    genreScifi: avgArr(genres.genreScifi),
    genreThriller: avgArr(genres.genreThriller),
    genreComedy: avgArr(genres.genreComedy),
    genreBookAdapt: avgArr(genres.genreBookAdapt),
    genreFantasy: avgArr(genres.genreFantasy),
    genreRomance: avgArr(genres.genreRomance),
    genreDocumentary: avgArr(genres.genreDocumentary),
    genreFamily: avgArr(genres.genreFamily),
    genreFilmNoir: avgArr(genres.genreFilmNoir),
    genreMusical: avgArr(genres.genreMusical),
    genreBiopic: avgArr(genres.genreBiopic),
    genreCrime: avgArr(genres.genreCrime),
    genreWestern: avgArr(genres.genreWestern),
    genreMystery: avgArr(genres.genreMystery),
  };

  const scaledComponents = upscaleProfile(rawProfile);
  const scaledGenres = upscaleProfile(rawGenres);

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...scaledComponents, ...scaledGenres },
    update: { ...scaledComponents, ...scaledGenres },
  });
}

/**
 * Find users similar to a given user (≥80% match on component preferences).
 * Returns top N matches with their match percentage.
 */
export async function findSimilarUsers(userId: string, limit = 10) {
  const myProfile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!myProfile) return [];

  const allProfiles = await prisma.userProfile.findMany({
    where: { userId: { not: userId } },
    include: { user: { select: { id: true, name: true, avatarUrl: true, isPrivate: true } } },
  });

  const componentKeys = [
    "plotFocused", "visualFocused", "scriptFocused", "actingFocused",
    "originalityFocused", "characterFocused", "messageFocused",
  ] as const;

  const genreKeys = [
    "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
    "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
    "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
    "genreCrime", "genreWestern", "genreMystery",
  ] as const;

  const results = allProfiles.map((profile) => {
    const componentScores = componentKeys.map((key) => ({
      similarity: dimensionSimilarity(myProfile[key], profile[key]),
      preference: profile[key],
      match: matchScore(dimensionSimilarity(myProfile[key], profile[key]), profile[key], false),
    }));

    const genreScores = genreKeys.map((key) => ({
      similarity: dimensionSimilarity(myProfile[key], profile[key]),
      preference: profile[key],
      match: matchScore(dimensionSimilarity(myProfile[key], profile[key]), profile[key], true),
    }));

    const allSimilarities = [...componentScores, ...genreScores].map((s) => s.similarity);
    const overallMatch = allSimilarities.reduce((a, b) => a + b, 0) / allSimilarities.length;
    const strongMatches = [...componentScores, ...genreScores].filter((s) => s.match === 2).length;

    return {
      user: profile.user,
      profile,
      overallMatch: Math.round(overallMatch * 100),
      strongMatches,
    };
  });

  return results
    .filter((r) => r.overallMatch >= 60)
    .sort((a, b) => b.overallMatch - a.overallMatch || b.strongMatches - a.strongMatches)
    .slice(0, limit);
}

/**
 * Get predicted Ratist rating for a movie for a given user,
 * based on ratings from similar users.
 */
export async function getPredictedRating(userId: string, movieId: string): Promise<number | null> {
  const similar = await findSimilarUsers(userId, 20);
  if (similar.length === 0) return null;

  const similarUserIds = similar
    .filter((s) => s.overallMatch >= 80)
    .map((s) => s.user.id);
  if (similarUserIds.length === 0) return null;

  const ratings = await prisma.movieRating.findMany({
    where: { movieId, userId: { in: similarUserIds }, ratistRating: { not: null } },
    select: { ratistRating: true },
  });

  if (ratings.length === 0) return null;
  const avg = ratings.reduce((a, b) => a + (b.ratistRating ?? 0), 0) / ratings.length;
  return Math.round(avg * 100) / 100;
}
