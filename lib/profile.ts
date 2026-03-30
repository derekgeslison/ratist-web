import { prisma } from "./prisma";
import { upscaleProfile, dimensionSimilarity, matchScore } from "./ratings";

/** Maps TMDB genre IDs to UserProfile genre preference keys */
const TMDB_GENRE_TO_PROFILE: Record<number, string> = {
  28:    "genreAction",      // Action
  12:    "genreAction",      // Adventure
  35:    "genreComedy",      // Comedy
  80:    "genreCrime",       // Crime
  99:    "genreDocumentary", // Documentary
  18:    "genreDrama",       // Drama
  10751: "genreFamily",      // Family
  14:    "genreFantasy",     // Fantasy
  36:    "genreHistorical",  // History
  27:    "genreHorror",      // Horror
  10402: "genreMusical",     // Music
  9648:  "genreMystery",     // Mystery
  10749: "genreRomance",     // Romance
  878:   "genreScifi",       // Science Fiction
  53:    "genreThriller",    // Thriller
  10752: "genreHistorical",  // War
  37:    "genreWestern",     // Western
};

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
 * Estimate how much a user would enjoy a movie, based on:
 *   1. Community sub-field averages → movie's score per focused category
 *   2. User's focused category preferences as weights
 *   3. Genre adjustment (25% blend)
 *
 * Formula:
 *   componentEstimate = Σ(movieCategoryScore × userPref) / Σ(userPref)
 *   genreScore        = avg(userGenrePref for each of the movie's genres)
 *   estimate          = componentEstimate × 0.75 + genreScore × 0.25
 */
export async function getScoreEstimate(userId: string, movieId: string): Promise<number | null> {
  const [profile, communityAvg, movie] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.movieRating.aggregate({
      where: { movieId },
      _avg: {
        plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
        relatability: true, characterDev: true, dialogueScripting: true,
        overallEmotion: true, meaning: true, movingness: true,
        cinematography: true, artisticEffect: true, visualEffects: true,
        locationCost: true, musicSound: true,
        casting: true, actingQuality: true, blockingChoreo: true,
        appeal: true,
      },
      _count: { ratistRating: true },
    }),
    prisma.movie.findUnique({
      where: { id: movieId },
      include: { genres: true },
    }),
  ]);

  if (!profile) return null;
  // Need community ratings to compute an estimate
  if (communityAvg._count.ratistRating === 0) return null;

  // Check profile has been built (at least one non-zero category)
  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some(
    (k) => (profile[k] as number) > 0
  );
  if (!hasProfile) return null;

  const avg = communityAvg._avg as Record<string, number | null>;

  // Component estimate: preference-weighted average of movie's category scores
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
    const movieCategoryScore = subFieldAvg(avg, fields);
    const userPref = profile[cat] as number;
    if (movieCategoryScore != null && userPref > 0) {
      weightedSum += movieCategoryScore * userPref;
      totalWeight += userPref;
    }
  }

  if (totalWeight === 0) return null;
  const componentEstimate = weightedSum / totalWeight;

  // Genre adjustment: blend in user's affinity for the movie's genres
  const genreScores: number[] = [];
  if (movie) {
    for (const mg of movie.genres) {
      const profileKey = TMDB_GENRE_TO_PROFILE[mg.genreId];
      if (profileKey) {
        genreScores.push((profile as unknown as Record<string, number>)[profileKey] ?? 0);
      }
    }
  }

  let estimate = componentEstimate;
  if (genreScores.length > 0) {
    const genreScore = genreScores.reduce((a, b) => a + b, 0) / genreScores.length;
    estimate = componentEstimate * 0.90 + genreScore * 0.10;
  }

  return Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10;
}

/**
 * Batch version of getScoreEstimate — computes estimates for multiple movies in 3 queries.
 * Returns a map of movieId → estimated score (or null if not computable).
 */
export async function getBatchScoreEstimates(
  userId: string,
  movieIds: string[]
): Promise<Map<string, number | null>> {
  if (movieIds.length === 0) return new Map();

  const [profile, communityAvgs, movies] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.movieRating.groupBy({
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
      _count: { ratistRating: true },
    }),
    prisma.movie.findMany({
      where: { id: { in: movieIds } },
      include: { genres: true },
    }),
  ]);

  const result = new Map<string, number | null>();

  if (!profile) {
    movieIds.forEach((id) => result.set(id, null));
    return result;
  }

  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some(
    (k) => (profile[k] as number) > 0
  );
  if (!hasProfile) {
    movieIds.forEach((id) => result.set(id, null));
    return result;
  }

  const communityMap = new Map(
    communityAvgs.map((c) => [c.movieId, { avg: c._avg as Record<string, number | null>, count: c._count.ratistRating }])
  );
  const movieMap = new Map(movies.map((m) => [m.id, m]));

  for (const movieId of movieIds) {
    const community = communityMap.get(movieId);
    if (!community || community.count === 0) { result.set(movieId, null); continue; }

    const avg = community.avg;
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const movieCategoryScore = subFieldAvg(avg, fields);
      const userPref = profile[cat] as number;
      if (movieCategoryScore != null && userPref > 0) {
        weightedSum += movieCategoryScore * userPref;
        totalWeight += userPref;
      }
    }

    if (totalWeight === 0) { result.set(movieId, null); continue; }
    const componentEstimate = weightedSum / totalWeight;

    const movie = movieMap.get(movieId);
    let estimate = componentEstimate;
    if (movie) {
      const genreScores: number[] = [];
      for (const mg of movie.genres) {
        const profileKey = TMDB_GENRE_TO_PROFILE[mg.genreId];
        if (profileKey) genreScores.push((profile as unknown as Record<string, number>)[profileKey] ?? 0);
      }
      if (genreScores.length > 0) {
        const genreScore = genreScores.reduce((a, b) => a + b, 0) / genreScores.length;
        estimate = componentEstimate * 0.90 + genreScore * 0.10;
      }
    }

    result.set(movieId, Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10);
  }

  return result;
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
