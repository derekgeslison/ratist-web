import { prisma } from "./prisma";
import { upscaleProfile, dimensionSimilarity, matchScore } from "./ratings";

/** Maps TMDB genre IDs to UserProfile genre preference keys */
export const TMDB_GENRE_TO_PROFILE: Record<number, string> = {
  28:    "genreAction",      // Action
  12:    "genreAction",      // Adventure
  16:    "genreAnimation",   // Animation
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
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;

/**
 * Compute the genre-score contribution used to blend with componentEstimate.
 *
 * Returns null when the title has no recognizable genres. Otherwise averages
 * the user's per-genre prefs (via getProfileGenreKeys to handle TV multi-
 * mappings), with one twist:
 *
 *   When the community ratistRating average is >= 8.0, "detractor" genres
 *   (prefs < 5.0, i.e. genres the user generally dislikes) have their
 *   distance below 5.0 halved. A 0.00 becomes 2.50, a 2.72 becomes 3.86,
 *   etc. Prefs >= 5.0 are unchanged.
 *
 * Rationale: when the community endorses a film strongly (>= 8.0), exceptional
 * cinema in a disliked genre should be partially rescued from the genre
 * penalty without erasing it. Mediocre films in disliked genres (community
 * < 8.0) get the full penalty.
 */
function computeGenreScore(
  profile: Record<string, number>,
  titleGenres: { genreId: number }[],
  communityRatistAvg: number | null,
): number | null {
  const prefs: number[] = [];
  for (const tg of titleGenres) {
    for (const profileKey of getProfileGenreKeys(tg.genreId)) {
      prefs.push(profile[profileKey] ?? 0);
    }
  }
  if (prefs.length === 0) return null;

  const dampen = communityRatistAvg != null && communityRatistAvg >= 8.0;
  const adjusted = prefs.map((p) => (dampen && p < 5 ? 5 - (5 - p) * 0.5 : p));
  return adjusted.reduce((a, b) => a + b, 0) / adjusted.length;
}

/** The component/genre blend used by all score estimators. */
const COMPONENT_WEIGHT = 0.70;
const GENRE_WEIGHT = 0.30;

/**
 * Genre-prefs-only score fallback. Averages the user's profile preferences
 * across a movie/show's TMDB genre IDs. Returns null when the title has
 * no recognizable genres or the user has no prefs in any of them.
 *
 * Used as a last-resort signal in /recommend when predictRatingsBatch
 * can't predict — typically because the title isn't in our internal DB,
 * has zero community ratings, or its community ratings are all quick
 * (no sub-field data for the focused-category math to run on). Keeps
 * the match-percent badge visible even when the prediction engine has
 * nothing to work with.
 */
export function genrePrefsScore(
  profile: Record<string, unknown>,
  tmdbGenreIds: number[],
): number | null {
  const scores: number[] = [];
  for (const id of tmdbGenreIds) {
    const profileKey = TMDB_GENRE_TO_PROFILE[id];
    if (!profileKey) continue;
    const v = profile[profileKey];
    if (typeof v === "number") scores.push(v);
  }
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg > 0 ? avg : null;
}

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
 * Maps a TMDB genre ID (movie OR TV) to the UserProfile genre key(s)
 * it should contribute to. Most TMDB genres map 1:1; TV's combined
 * genres ("Sci-Fi & Fantasy", "Action & Adventure", "War & Politics",
 * "Kids") map to one or more of the existing profile keys so TV
 * ratings can update the same persona dimensions as movies.
 *
 * Some TV-only TMDB genres (News, Reality, Soap, Talk) intentionally
 * map to nothing — the profile doesn't have a dimension for those.
 */
export function getProfileGenreKeys(tmdbGenreId: number): string[] {
  switch (tmdbGenreId) {
    // TV-specific that map to existing profile keys
    case 10759: return ["genreAction"];                  // Action & Adventure
    case 10765: return ["genreScifi", "genreFantasy"];   // Sci-Fi & Fantasy
    case 10768: return ["genreHistorical"];              // War & Politics
    case 10762: return ["genreFamily"];                  // Kids
    default: {
      const k = TMDB_GENRE_TO_PROFILE[tmdbGenreId];
      return k ? [k] : [];
    }
  }
}

/**
 * The 21 sub-fields a Ratist rating carries. Used to detect whether a
 * rating has any user-supplied sub-field data ("filled out the full
 * rubric") so we can decide whether to substitute community averages.
 */
const ALL_SUBFIELDS = [
  "plot", "storytelling", "pacingClimax", "premiseOriginality",
  "relatability", "characterDev", "dialogueScripting",
  "overallEmotion", "meaning", "movingness",
  "cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound",
  "casting", "actingQuality", "blockingChoreo",
  "appeal", "superficialAllure", "choreography",
] as const;

/** "Did the user actually fill out the Ratist rubric for this rating?"
 *  Returns false for basic/quick ratings, imports, and any "standard"
 *  rating where the user left every sub-field blank. */
function hasUserSubfields(rating: Record<string, unknown>): boolean {
  if (rating.reviewType === "basic") return false;
  return ALL_SUBFIELDS.some((f) => typeof rating[f] === "number");
}

/**
 * Count how many of a user's ratings (movies + TV, series-scope only)
 * actually represent a filled-out Ratist rubric. This is the single
 * source of truth for two gates that previously diverged:
 *   - rebuildUserProfile: skips the statedPrefs blend at >= 10
 *   - settings page: hides the genre + component editor at >= 10
 *
 * Counts presence of any subfield (via hasUserSubfields), not just
 * reviewType, so a partially-filled "standard" with no rubric data
 * doesn't falsely count and a quick rating with subfields doesn't
 * falsely escape the count.
 */
export const FULL_RATIST_THRESHOLD = 10;

export async function getFullRatistCount(userId: string): Promise<number> {
  const [movieRatings, tvRatings] = await Promise.all([
    prisma.movieRating.findMany({
      where: { userId },
      select: {
        reviewType: true,
        plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
        relatability: true, characterDev: true, dialogueScripting: true,
        overallEmotion: true, meaning: true, movingness: true,
        cinematography: true, artisticEffect: true, visualEffects: true,
        locationCost: true, musicSound: true,
        casting: true, actingQuality: true, blockingChoreo: true,
        appeal: true, superficialAllure: true, choreography: true,
      },
    }),
    prisma.tVShowRating.findMany({
      where: { userId, ratingScope: "series" },
      select: {
        reviewType: true,
        plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
        relatability: true, characterDev: true, dialogueScripting: true,
        overallEmotion: true, meaning: true, movingness: true,
        cinematography: true, artisticEffect: true, visualEffects: true,
        locationCost: true, musicSound: true,
        casting: true, actingQuality: true, blockingChoreo: true,
        appeal: true, superficialAllure: true, choreography: true,
      },
    }),
  ]);
  let count = 0;
  for (const r of movieRatings) if (hasUserSubfields(r as unknown as Record<string, unknown>)) count++;
  for (const r of tvRatings) if (hasUserSubfields(r as unknown as Record<string, unknown>)) count++;
  return count;
}

/**
 * Rebuilds a user's persona profile from all their ratings (movies + TV).
 * Called after every new/edited rating.
 *
 * Component preferences (narrative / character / message / cinematic /
 * performance / entertainment focused) come from the 21 sub-fields. For
 * Ratist ratings, use the user's actual sub-fields; for basic/quick or
 * imports (which carry only an overall rating), substitute community
 * averages of those sub-fields as a stand-in. Contribution per rating:
 *   if MAX(communitySubfieldAvg, userSubfieldAvg) >= 7.5
 *     AND overallRating >= 7.5
 *   → user's overallRating
 *   else → 0
 * Average over all rated titles, then upscale so the max category → 10.
 *
 * Genre preferences come from the user's overall rating averaged across
 * the title's TMDB genres, gated at >= 7.5 ("liked it"):
 *   contribution per (rating, genre) = overallRating if overall >= 7.5
 *                                       AND title has that genre, else 0
 *   raw_score[G] = mean over all rated titles of the contribution
 *   upscaled so the max genre → 10
 *
 * TV ratings (series scope) feed the same buckets as movies. TV-only
 * genre IDs are mapped through getProfileGenreKeys (e.g. "Sci-Fi &
 * Fantasy" → both genreScifi and genreFantasy).
 *
 * Blending: for users with < FULL_RATIST_THRESHOLD full Ratist ratings,
 * the upscaled scores are blended with their statedPrefs (onboarding
 * picks) at a weight decaying linearly from 70% to 0% as
 * fullRatistCount climbs to FULL_RATIST_THRESHOLD. The high starting
 * weight matters because rating-derived signal is sparse for new
 * users — at 0 ratings the entire rating-derived profile is empty, so
 * a 10% onboarding contribution leaves you with effectively no
 * personalization; 70% lets the onboarding picks actually carry the
 * profile until rating signal accumulates.
 */
const LIKED_THRESHOLD = 7.5;

export async function rebuildUserProfile(userId: string) {
  const [movieRatings, tvRatings] = await Promise.all([
    prisma.movieRating.findMany({ where: { userId } }),
    prisma.tVShowRating.findMany({ where: { userId, ratingScope: "series" } }),
  ]);

  const validMovieRatings = movieRatings.filter((r) => r.overallRating != null);
  const validTvRatings = tvRatings.filter((r) => r.overallRating != null);
  const totalValid = validMovieRatings.length + validTvRatings.length;

  if (totalValid === 0) {
    // No ratings at all — keep onboarding preferences as-is
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return;
  }

  // Count full Ratist ratings (movies + TV) for blending threshold.
  // Computed inline rather than calling getFullRatistCount to avoid a
  // second round-trip — we already have the rating rows loaded here.
  let fullRatistCount = 0;
  for (const r of movieRatings) if (hasUserSubfields(r as unknown as Record<string, unknown>)) fullRatistCount++;
  for (const r of tvRatings) if (hasUserSubfields(r as unknown as Record<string, unknown>)) fullRatistCount++;

  const currentProfile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { statedPrefs: true },
  });
  const statedPrefs = currentProfile?.statedPrefs as Record<string, number> | null;

  const movieIds = validMovieRatings.map((r) => r.movieId);
  const tvShowIds = validTvRatings.map((r) => r.tvShowId);

  // Community sub-field averages + per-title genres in one round of
  // parallel queries. Series-scope only for TV community avgs so per-
  // season rows don't double-count.
  const [movieCommunityAvgs, tvCommunityAvgs, movieGenres, tvShowGenres] = await Promise.all([
    movieIds.length > 0
      ? prisma.movieRating.groupBy({
          by: ["movieId"],
          where: { movieId: { in: movieIds }, excluded: false },
          _avg: {
            plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
            relatability: true, characterDev: true, dialogueScripting: true,
            overallEmotion: true, meaning: true, movingness: true,
            cinematography: true, artisticEffect: true, visualEffects: true,
            locationCost: true, musicSound: true,
            casting: true, actingQuality: true, blockingChoreo: true,
            appeal: true,
          },
        })
      : Promise.resolve([] as { movieId: string; _avg: Record<string, number | null> }[]),
    tvShowIds.length > 0
      ? prisma.tVShowRating.groupBy({
          by: ["tvShowId"],
          where: { tvShowId: { in: tvShowIds }, excluded: false, ratingScope: "series" },
          _avg: {
            plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
            relatability: true, characterDev: true, dialogueScripting: true,
            overallEmotion: true, meaning: true, movingness: true,
            cinematography: true, artisticEffect: true, visualEffects: true,
            locationCost: true, musicSound: true,
            casting: true, actingQuality: true, blockingChoreo: true,
            appeal: true,
          },
        })
      : Promise.resolve([] as { tvShowId: string; _avg: Record<string, number | null> }[]),
    movieIds.length > 0
      ? prisma.movieGenre.findMany({ where: { movieId: { in: movieIds } }, select: { movieId: true, genreId: true } })
      : Promise.resolve([] as { movieId: string; genreId: number }[]),
    tvShowIds.length > 0
      ? prisma.tVShowGenre.findMany({ where: { tvShowId: { in: tvShowIds } }, select: { tvShowId: true, genreId: true } })
      : Promise.resolve([] as { tvShowId: string; genreId: number }[]),
  ]);

  const movieCommunityMap = new Map(
    movieCommunityAvgs.map((c) => [c.movieId, c._avg as Record<string, number | null>])
  );
  const tvCommunityMap = new Map(
    tvCommunityAvgs.map((c) => [c.tvShowId, c._avg as Record<string, number | null>])
  );
  const movieGenresByMovie = new Map<string, number[]>();
  for (const g of movieGenres) {
    const arr = movieGenresByMovie.get(g.movieId) ?? [];
    arr.push(g.genreId);
    movieGenresByMovie.set(g.movieId, arr);
  }
  const tvGenresByShow = new Map<string, number[]>();
  for (const g of tvShowGenres) {
    const arr = tvGenresByShow.get(g.tvShowId) ?? [];
    arr.push(g.genreId);
    tvGenresByShow.set(g.tvShowId, arr);
  }

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

  // Unified iteration over movie + TV ratings.
  type UnifiedRating = {
    overallRating: number;
    raw: Record<string, number | null>;
    community: Record<string, number | null>;
    genreIds: number[];
    reviewType: string;
  };
  const unified: UnifiedRating[] = [
    ...validMovieRatings.map((r) => ({
      overallRating: r.overallRating!,
      raw: r as unknown as Record<string, number | null>,
      community: movieCommunityMap.get(r.movieId) ?? {},
      genreIds: movieGenresByMovie.get(r.movieId) ?? [],
      reviewType: r.reviewType,
    })),
    ...validTvRatings.map((r) => ({
      overallRating: r.overallRating!,
      raw: r as unknown as Record<string, number | null>,
      community: tvCommunityMap.get(r.tvShowId) ?? {},
      genreIds: tvGenresByShow.get(r.tvShowId) ?? [],
      reviewType: r.reviewType,
    })),
  ];

  for (const rating of unified) {
    const overallRating = rating.overallRating;
    // Use community sub-fields as a stand-in for basic/quick ratings and
    // any "standard" rating where the user left all sub-fields blank.
    // Otherwise use the user's own sub-fields. The component formula
    // still maxes against community separately below — this just
    // controls what "user's view" means for max() input.
    const effectiveScores = hasUserSubfields(rating.raw as unknown as Record<string, unknown>)
      ? rating.raw
      : rating.community;

    // Component contributions.
    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const userAvg = subFieldAvg(effectiveScores, fields);
      const communityAvg = subFieldAvg(rating.community, fields);
      const maxVal = Math.max(userAvg ?? 0, communityAvg ?? 0);
      const contribution = maxVal >= LIKED_THRESHOLD && overallRating >= LIKED_THRESHOLD ? overallRating : 0;
      categoryContributions[cat].push(contribution);
    }

    // Genre contributions — derived from the title's actual TMDB genres
    // (not from non-existent per-rating genre columns). If the user
    // liked the title (overall >= LIKED_THRESHOLD), contribute the
    // user's overall to each profile-genre the title is tagged with;
    // otherwise contribute 0. Average is over ALL of the user's rated
    // titles (penalizes sparsity), matching the Excel spec.
    const liked = overallRating >= LIKED_THRESHOLD;
    const profileKeysHitByThisTitle = new Set<string>();
    for (const tmdbId of rating.genreIds) {
      for (const k of getProfileGenreKeys(tmdbId)) profileKeysHitByThisTitle.add(k);
    }
    for (const k of GENRE_KEYS) {
      const contribution = liked && profileKeysHitByThisTitle.has(k) ? overallRating : 0;
      genreContributions[k].push(contribution);
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

  // Blend with onboarding/settings preferences while the user is below
  // FULL_RATIST_THRESHOLD. Onboarding weight linearly decreases from
  // 70% at 0 ratings to 0% at FULL_RATIST_THRESHOLD. Was 10% — bumped
  // because at low rating counts the rating-derived side is mostly
  // empty so 10% wasn't enough to keep the profile feeling personal.
  let finalComponents = scaledComponents;
  let finalGenres = scaledGenres;

  if (fullRatistCount < FULL_RATIST_THRESHOLD && statedPrefs) {
    const onboardingWeight = 0.70 * (1 - fullRatistCount / FULL_RATIST_THRESHOLD);
    const ratingWeight = 1 - onboardingWeight;

    const componentKeys = Object.keys(FOCUSED_CATEGORIES) as FocusedKey[];
    finalComponents = Object.fromEntries(
      componentKeys.map((k) => [
        k,
        (statedPrefs[k] ?? 0) * onboardingWeight + (scaledComponents[k] ?? 0) * ratingWeight,
      ])
    );

    finalGenres = Object.fromEntries(
      GENRE_KEYS.map((k) => [
        k,
        (statedPrefs[k] ?? 0) * onboardingWeight + (scaledGenres[k] ?? 0) * ratingWeight,
      ])
    );
  }

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...finalComponents, ...finalGenres },
    update: { ...finalComponents, ...finalGenres },
  });

  // A profile shift moves every cached collection match score for this
  // user, so wipe them. Inlined as a direct deleteMany rather than
  // importing from collection-match.ts to avoid a circular import — that
  // module imports the score estimators from this file.
  await prisma.collectionMatchCache.deleteMany({ where: { userId } });
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
    include: { user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true, isPrivate: true } } },
  });

  const componentKeys = [
    "narrativeFocused", "characterFocused", "messageFocused",
    "cinematicFocused", "performanceFocused", "entertainmentFocused",
  ] as const;

  const genreKeys = [
    "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
    "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
    "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
    "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
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
 * Estimate how much a user would enjoy a movie.
 *
 * Formula:
 *   componentEstimate = Σ(movieCategoryScore × userPref) / Σ(userPref)
 *   genreScore        = computeGenreScore(profile, movie.genres, communityRatistAvg)
 *   estimate          = componentEstimate × 0.70 + genreScore × 0.30
 *
 * The genre score applies detractor dampening when the community average
 * ratistRating is >= 8.0 — see computeGenreScore for details.
 */
export async function getScoreEstimate(userId: string, movieId: string): Promise<number | null> {
  const [profile, communityAvg, movie] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.movieRating.aggregate({
      where: { movieId, excluded: false },
      _avg: {
        ratistRating: true,
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
  if (communityAvg._count.ratistRating === 0) return null;

  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some(
    (k) => (profile[k] as number) > 0
  );
  if (!hasProfile) return null;

  const avg = communityAvg._avg as Record<string, number | null>;

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

  let estimate = componentEstimate;
  if (movie) {
    const genreScore = computeGenreScore(
      profile as unknown as Record<string, number>,
      movie.genres,
      avg.ratistRating ?? null,
    );
    if (genreScore != null) {
      estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
    }
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
      where: { movieId: { in: movieIds }, excluded: false },
      _avg: {
        ratistRating: true,
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
      const genreScore = computeGenreScore(
        profile as unknown as Record<string, number>,
        movie.genres,
        avg.ratistRating ?? null,
      );
      if (genreScore != null) {
        estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
      }
    }

    result.set(movieId, Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10);
  }

  return result;
}

/**
 * Batch TV-show score estimator. Mirror of getBatchScoreEstimates but
 * sourced from tVShowRating with ratingScope = "series" so per-season
 * rating rows don't double-count one show. Returns internal-id keyed
 * Map; caller resolves TMDB → internal first.
 */
export async function getBatchScoreEstimatesTv(
  userId: string,
  tvShowIds: string[]
): Promise<Map<string, number | null>> {
  if (tvShowIds.length === 0) return new Map();

  const [profile, communityAvgs, shows] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.tVShowRating.groupBy({
      by: ["tvShowId"],
      // ratingScope = "series" only — per-season ratings would tilt the
      // community averages toward whatever seasons happened to be rated
      // most often, which isn't representative of the show as a whole.
      where: { tvShowId: { in: tvShowIds }, excluded: false, ratingScope: "series" },
      _avg: {
        ratistRating: true,
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
    prisma.tVShow.findMany({
      where: { id: { in: tvShowIds } },
      include: { genres: true },
    }),
  ]);

  const result = new Map<string, number | null>();

  if (!profile) {
    tvShowIds.forEach((id) => result.set(id, null));
    return result;
  }

  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some(
    (k) => (profile[k] as number) > 0
  );
  if (!hasProfile) {
    tvShowIds.forEach((id) => result.set(id, null));
    return result;
  }

  const communityMap = new Map(
    communityAvgs.map((c) => [c.tvShowId, { avg: c._avg as Record<string, number | null>, count: c._count.ratistRating }])
  );
  const showMap = new Map(shows.map((s) => [s.id, s]));

  for (const tvShowId of tvShowIds) {
    const community = communityMap.get(tvShowId);
    if (!community || community.count === 0) { result.set(tvShowId, null); continue; }

    const avg = community.avg;
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const showCategoryScore = subFieldAvg(avg, fields);
      const userPref = profile[cat] as number;
      if (showCategoryScore != null && userPref > 0) {
        weightedSum += showCategoryScore * userPref;
        totalWeight += userPref;
      }
    }

    if (totalWeight === 0) { result.set(tvShowId, null); continue; }
    const componentEstimate = weightedSum / totalWeight;

    const show = showMap.get(tvShowId);
    let estimate = componentEstimate;
    if (show) {
      const genreScore = computeGenreScore(
        profile as unknown as Record<string, number>,
        show.genres,
        avg.ratistRating ?? null,
      );
      if (genreScore != null) {
        estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
      }
    }

    result.set(tvShowId, Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10);
  }

  return result;
}

/**
 * Per-season score estimates for one show. Mirrors getBatchScoreEstimatesTv
 * but groups by seasonNumber and requires at least one full Ratist rating
 * (plot != null) per season so the estimate is grounded in real category
 * data, not on a few stray 1–10 ratings.
 *
 * Returns Map<seasonNumber, number | null>. Entries are present only for
 * seasons that had >= 1 full Ratist rating; absent seasonNumbers should
 * be treated as "no estimate yet" by the caller.
 */
export async function getSeasonScoreEstimatesTv(
  userId: string,
  tvShowId: string
): Promise<Map<number, number | null>> {
  const [profile, communityAvgs, show] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.tVShowRating.groupBy({
      by: ["seasonNumber"],
      where: {
        tvShowId,
        excluded: false,
        ratingScope: "season",
        plot: { not: null }, // gate: at least one full Ratist rating
      },
      _avg: {
        ratistRating: true,
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
    prisma.tVShow.findUnique({
      where: { id: tvShowId },
      include: { genres: true },
    }),
  ]);

  const result = new Map<number, number | null>();
  if (!profile) return result;

  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some(
    (k) => (profile[k] as number) > 0
  );
  if (!hasProfile) return result;

  for (const row of communityAvgs) {
    if ((row._count.ratistRating ?? 0) === 0) continue;
    const avg = row._avg as Record<string, number | null>;
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const seasonCategoryScore = subFieldAvg(avg, fields);
      const userPref = profile[cat] as number;
      if (seasonCategoryScore != null && userPref > 0) {
        weightedSum += seasonCategoryScore * userPref;
        totalWeight += userPref;
      }
    }
    if (totalWeight === 0) { result.set(row.seasonNumber, null); continue; }
    const componentEstimate = weightedSum / totalWeight;

    // Detractor dampening is community-rating dependent, so genre score
    // varies by season even though the show's genre tags don't.
    let estimate = componentEstimate;
    if (show) {
      const genreScore = computeGenreScore(
        profile as unknown as Record<string, number>,
        show.genres,
        avg.ratistRating ?? null,
      );
      if (genreScore != null) {
        estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
      }
    }
    result.set(row.seasonNumber, Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10);
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
