import { prisma } from "./prisma";
import { upscaleProfile, dimensionSimilarity, matchScore } from "./ratings";

const FOCUSED_CATEGORIES = {
  narrativeFocused:     ["plot", "storytelling", "pacingClimax", "premiseOriginality"],
  characterFocused:     ["relatability", "characterDev", "dialogueScripting"],
  messageFocused:       ["overallEmotion", "meaning", "movingness"],
  cinematicFocused:     ["cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound"],
  performanceFocused:   ["casting", "actingQuality", "blockingChoreo"],
  entertainmentFocused: ["appeal", "pacingClimax"],
} as const;

type FocusedKey = keyof typeof FOCUSED_CATEGORIES;

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery",
] as const;

function subFieldAvg(obj: Record<string, number | null | undefined>, fields: readonly string[]): number | null {
  const vals = fields
    .map((f) => obj[f])
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function avgArr(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Rebuilds a user's persona profile from all their ratings.
 * Called after every new/edited rating.
 *
 * Algorithm:
 *   For each focused category (e.g. narrativeFocused with fields [plot, storytelling, ...]):
 *     For each movie rating where overallRating is set:
 *       communityAvg = avg of non-null community sub-field scores
 *       userAvg = avg of non-null user sub-field scores
 *       if MAX(communityAvg, userAvg) >= 8 AND overallRating >= 8:
 *         contribution = overallRating
 *       else:
 *         contribution = 0
 *     raw_score = avg(all contributions, including 0s)
 *   Then upscale so max category score = 10.
 *
 *   Genre: if genreScore >= 8 AND overallRating >= 8 → contribution = overallRating, else 0.
 */
export async function rebuildUserProfile(userId: string) {
  const ratings = await prisma.movieRating.findMany({
    where: { userId },
  });

  // Only use ratings where overallRating is explicitly set
  const validRatings = ratings.filter((r) => r.overallRating != null);

  if (validRatings.length === 0) {
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return;
  }

  const movieIds = validRatings.map((r) => r.movieId);

  // Community sub-field averages for each movie
  const communityAvgs = await prisma.movieRating.groupBy({
    by: ["movieId"],
    where: { movieId: { in: movieIds } },
    _avg: {
      plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
      relatability: true, characterDev: true, dialogueScripting: true,
      overallEmotion: true, meaning: true, movingness: true,
      cinematography: true, artisticEffect: true, visualEffects: true,
      locationCost: true, musicSound: true,
      casting: true, actingQuality: true, blockingChoreo: true,
      appeal: true,
    },
  });
  const communityMap = new Map(
    communityAvgs.map((c) => [c.movieId, c._avg as Record<string, number | null>])
  );

  const THRESHOLD = 8;

  const categoryContributions: Record<FocusedKey, number[]> = {
    narrativeFocused: [],
    characterFocused: [],
    messageFocused: [],
    cinematicFocused: [],
    performanceFocused: [],
    entertainmentFocused: [],
  };

  const genreContributions: Record<string, number[]> = Object.fromEntries(
    GENRE_KEYS.map((k) => [k, [] as number[]])
  );

  for (const rating of validRatings) {
    const overallRating = rating.overallRating!;
    const community = communityMap.get(rating.movieId) ?? {};
    const ratingObj = rating as unknown as Record<string, number | null>;

    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const userAvg = subFieldAvg(ratingObj, fields);
      const communityAvg = subFieldAvg(community, fields);
      const maxVal = Math.max(userAvg ?? 0, communityAvg ?? 0);
      const contribution = maxVal >= THRESHOLD && overallRating >= THRESHOLD ? overallRating : 0;
      categoryContributions[cat].push(contribution);
    }

    for (const key of GENRE_KEYS) {
      const genreScore = ratingObj[key];
      if (genreScore != null) {
        const contribution = genreScore >= THRESHOLD && overallRating >= THRESHOLD ? overallRating : 0;
        genreContributions[key].push(contribution);
      }
    }
  }

  const rawComponents = Object.fromEntries(
    (Object.keys(categoryContributions) as FocusedKey[]).map((k) => [k, avgArr(categoryContributions[k])])
  ) as Record<string, number>;

  const rawGenres = Object.fromEntries(
    GENRE_KEYS.map((k) => [k, avgArr(genreContributions[k])])
  ) as Record<string, number>;

  const scaledComponents = upscaleProfile(rawComponents);
  const scaledGenres = upscaleProfile(rawGenres);

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...scaledComponents, ...scaledGenres },
    update: { ...scaledComponents, ...scaledGenres },
  });
}

/**
 * Find users similar to a given user (≥60% match on component preferences).
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
    "narrativeFocused", "characterFocused", "messageFocused",
    "cinematicFocused", "performanceFocused", "entertainmentFocused",
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
