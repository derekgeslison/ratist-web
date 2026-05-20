import { prisma } from "@/lib/prisma";

/**
 * Backfill-style prediction-accuracy report for the admin dashboard.
 *
 * Methodology: leave-one-out. For every Fanatics rating in the DB, we
 * recompute the score estimate the system WOULD have produced for that
 * user/title without that user's own rating in the community aggregate.
 * Comparing that to the user's actual ratistRating gives us a per-rating
 * absolute error; aggregating by month surfaces the "are we improving
 * as the dataset grows" trend the admin actually wants to see.
 *
 * The math mirrors lib/profile.ts getScoreEstimate / getBatchScoreEstimatesTv
 * — componentEstimate weighted by user prefs + 70/30 blend with genreScore
 * + 1-10 clamp. Keeping it inline (rather than importing those functions)
 * lets us do the leave-one-out adjustment on the aggregate inputs rather
 * than re-querying per rating.
 */

// Mirror of lib/profile.ts FOCUSED_CATEGORIES — keep in lockstep.
const FOCUSED_CATEGORIES = {
  narrativeFocused: ["plot", "storytelling", "pacingClimax", "premiseOriginality"],
  characterFocused: ["relatability", "characterDev", "dialogueScripting"],
  messageFocused: ["overallEmotion", "meaning", "movingness"],
  cinematicFocused: ["cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound"],
  performanceFocused: ["casting", "actingQuality", "blockingChoreo"],
  entertainmentFocused: ["appeal", "pacingClimax"],
} as const;
type FocusedKey = keyof typeof FOCUSED_CATEGORIES;
const COMPONENT_KEYS = Object.keys(FOCUSED_CATEGORIES) as FocusedKey[];

const COMPONENT_WEIGHT = 0.7;
const GENRE_WEIGHT = 0.3;

// Mirror of the TMDB-genre → profile-genre-pref map used by lib/profile.ts
// computeGenreScore. Has to stay in lockstep.
const TMDB_GENRE_TO_PROFILE_PREF: Record<number, string> = {
  28: "genreAction", 12: "genreAction", 16: "genreAnimation", 35: "genreComedy",
  80: "genreCrime", 99: "genreDocumentary", 18: "genreDrama", 10751: "genreFamily",
  14: "genreFantasy", 36: "genreHistorical", 27: "genreHorror", 10402: "genreMusical",
  9648: "genreMystery", 10749: "genreRomance", 878: "genreScifi", 53: "genreThriller",
  10752: "genreHistorical", 37: "genreWestern",
};

// Every rating subfield the prediction reads. Used to fetch raw rows
// without listing the columns three times.
const SUBFIELDS = [
  "plot", "storytelling", "pacingClimax", "premiseOriginality",
  "relatability", "characterDev", "dialogueScripting",
  "overallEmotion", "meaning", "movingness",
  "cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound",
  "casting", "actingQuality", "blockingChoreo",
  "appeal",
] as const;
type Subfield = (typeof SUBFIELDS)[number];

interface Aggregates {
  // Keyed by subfield → { sum, count } so we can do leave-one-out arithmetic
  // (subtract one user's contribution from sum + count) without re-querying.
  subfields: Record<Subfield, { sum: number; count: number }>;
  ratist: { sum: number; count: number };
}

function blankAggregates(): Aggregates {
  const subfields = Object.fromEntries(
    SUBFIELDS.map((f) => [f, { sum: 0, count: 0 }])
  ) as Record<Subfield, { sum: number; count: number }>;
  return { subfields, ratist: { sum: 0, count: 0 } };
}

function addToAggregate(agg: Aggregates, row: Record<string, number | null>) {
  for (const f of SUBFIELDS) {
    const v = row[f];
    if (typeof v === "number" && !isNaN(v)) {
      agg.subfields[f].sum += v;
      agg.subfields[f].count += 1;
    }
  }
  if (typeof row.ratistRating === "number" && !isNaN(row.ratistRating)) {
    agg.ratist.sum += row.ratistRating;
    agg.ratist.count += 1;
  }
}

function leaveOneOut(agg: Aggregates, row: Record<string, number | null>): Aggregates {
  // Returns a new aggregate with this row's contributions subtracted out.
  const next = blankAggregates();
  for (const f of SUBFIELDS) {
    const v = row[f];
    if (typeof v === "number" && !isNaN(v)) {
      next.subfields[f].sum = agg.subfields[f].sum - v;
      next.subfields[f].count = agg.subfields[f].count - 1;
    } else {
      next.subfields[f] = { ...agg.subfields[f] };
    }
  }
  if (typeof row.ratistRating === "number" && !isNaN(row.ratistRating)) {
    next.ratist = { sum: agg.ratist.sum - row.ratistRating, count: agg.ratist.count - 1 };
  } else {
    next.ratist = { ...agg.ratist };
  }
  return next;
}

function subFieldAvgFromAggregate(agg: Aggregates, fields: readonly string[]): number | null {
  const vals: number[] = [];
  for (const f of fields) {
    const slot = agg.subfields[f as Subfield];
    if (slot && slot.count > 0) vals.push(slot.sum / slot.count);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ratistAvgFromAggregate(agg: Aggregates): number | null {
  return agg.ratist.count > 0 ? agg.ratist.sum / agg.ratist.count : null;
}

function computeGenreScore(
  profile: Record<string, number>,
  genres: { genreId: number }[],
  communityAvgRatist: number | null,
): number | null {
  const prefs = genres
    .map((g) => TMDB_GENRE_TO_PROFILE_PREF[g.genreId])
    .filter((k): k is string => !!k)
    .map((k) => profile[k] ?? 0)
    .filter((v) => v > 0);
  if (prefs.length === 0) return null;
  const avg = prefs.reduce((a, b) => a + b, 0) / prefs.length;
  if (communityAvgRatist != null && communityAvgRatist >= 8 && avg < 5) {
    return Math.min(10, communityAvgRatist - (5 - avg));
  }
  return avg;
}

function predictFromAggregate(
  agg: Aggregates,
  profile: Record<string, number>,
  genres: { genreId: number }[],
): number | null {
  const hasProfile = COMPONENT_KEYS.some((k) => (profile[k] ?? 0) > 0);
  if (!hasProfile) return null;
  if (agg.ratist.count === 0) return null;

  let weightedSum = 0, totalWeight = 0;
  for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
    const movieCategoryScore = subFieldAvgFromAggregate(agg, fields);
    const userPref = profile[cat] ?? 0;
    if (movieCategoryScore != null && userPref > 0) {
      weightedSum += movieCategoryScore * userPref;
      totalWeight += userPref;
    }
  }
  if (totalWeight === 0) return null;
  const componentEstimate = weightedSum / totalWeight;

  let estimate = componentEstimate;
  const genreScore = computeGenreScore(profile, genres, ratistAvgFromAggregate(agg));
  if (genreScore != null) {
    estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
  }
  return Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10;
}

export interface AccuracySample {
  mediaType: "movie" | "tv";
  ratingId: string;
  userId: string;
  titleId: string;          // internal movie/tvshow id
  tmdbId: number;
  title: string;
  createdAt: Date;
  predicted: number;
  actual: number;
  absError: number;
}

export interface AccuracyReport {
  samples: AccuracySample[];          // every evaluable rating
  unevaluable: number;                 // ratings with no peers / no profile
  totalRatings: number;
  mae: number | null;                  // mean absolute error
  pctWithinHalf: number | null;        // % within ±0.5
  pctWithinOne: number | null;         // % within ±1.0
  histogram: { bucket: string; count: number }[]; // error histogram (0-0.5, 0.5-1, ...)
  monthly: { month: string; mae: number; count: number }[]; // YYYY-MM
}

function buildReportFromSamples(samples: AccuracySample[], totalRatings: number, unevaluable: number): AccuracyReport {
  if (samples.length === 0) {
    return {
      samples: [], unevaluable, totalRatings,
      mae: null, pctWithinHalf: null, pctWithinOne: null,
      histogram: [], monthly: [],
    };
  }
  const mae = samples.reduce((s, x) => s + x.absError, 0) / samples.length;
  const within = (threshold: number) => samples.filter((x) => x.absError <= threshold).length / samples.length * 100;

  // 6 buckets: 0–0.5, 0.5–1, 1–1.5, 1.5–2, 2–3, 3+
  const buckets = [
    { label: "0–0.5", lo: 0, hi: 0.5 },
    { label: "0.5–1.0", lo: 0.5, hi: 1.0 },
    { label: "1.0–1.5", lo: 1.0, hi: 1.5 },
    { label: "1.5–2.0", lo: 1.5, hi: 2.0 },
    { label: "2.0–3.0", lo: 2.0, hi: 3.0 },
    { label: "3.0+", lo: 3.0, hi: Infinity },
  ];
  const histogram = buckets.map((b) => ({
    bucket: b.label,
    count: samples.filter((x) => x.absError >= b.lo && (b.hi === Infinity ? true : x.absError < b.hi)).length,
  }));

  const byMonth = new Map<string, AccuracySample[]>();
  for (const s of samples) {
    const month = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(s);
  }
  const monthly = Array.from(byMonth.entries())
    .map(([month, list]) => ({
      month,
      mae: list.reduce((a, b) => a + b.absError, 0) / list.length,
      count: list.length,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    samples, unevaluable, totalRatings,
    mae,
    pctWithinHalf: within(0.5),
    pctWithinOne: within(1.0),
    histogram,
    monthly,
  };
}

/** Compute the accuracy report for all Fanatics ratings (movies + TV series). */
export async function computeAccuracyReport(limit: number = 5000): Promise<AccuracyReport> {
  // Movies + TV series in parallel.
  const [movieRatings, tvRatings, profiles, movies, shows] = await Promise.all([
    prisma.movieRating.findMany({
      where: { excluded: false, ratistRating: { not: null } },
      select: {
        id: true, userId: true, movieId: true, ratistRating: true, createdAt: true,
        plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
        relatability: true, characterDev: true, dialogueScripting: true,
        overallEmotion: true, meaning: true, movingness: true,
        cinematography: true, artisticEffect: true, visualEffects: true,
        locationCost: true, musicSound: true,
        casting: true, actingQuality: true, blockingChoreo: true,
        appeal: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.tVShowRating.findMany({
      where: { excluded: false, ratistRating: { not: null }, ratingScope: "series" },
      select: {
        id: true, userId: true, tvShowId: true, ratistRating: true, createdAt: true,
        plot: true, storytelling: true, pacingClimax: true, premiseOriginality: true,
        relatability: true, characterDev: true, dialogueScripting: true,
        overallEmotion: true, meaning: true, movingness: true,
        cinematography: true, artisticEffect: true, visualEffects: true,
        locationCost: true, musicSound: true,
        casting: true, actingQuality: true, blockingChoreo: true,
        appeal: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.userProfile.findMany(),
    prisma.movie.findMany({ select: { id: true, tmdbId: true, title: true, genres: { select: { genreId: true } } } }),
    prisma.tVShow.findMany({ select: { id: true, tmdbId: true, name: true, genres: { select: { genreId: true } } } }),
  ]);

  const profileById = new Map(profiles.map((p) => [p.userId, p as unknown as Record<string, number>]));
  const movieById = new Map(movies.map((m) => [m.id, m]));
  const showById = new Map(shows.map((s) => [s.id, s]));

  // Build per-title aggregates once.
  const movieAggs = new Map<string, Aggregates>();
  for (const r of movieRatings) {
    if (!movieAggs.has(r.movieId)) movieAggs.set(r.movieId, blankAggregates());
    addToAggregate(movieAggs.get(r.movieId)!, r as unknown as Record<string, number | null>);
  }
  const showAggs = new Map<string, Aggregates>();
  for (const r of tvRatings) {
    if (!showAggs.has(r.tvShowId)) showAggs.set(r.tvShowId, blankAggregates());
    addToAggregate(showAggs.get(r.tvShowId)!, r as unknown as Record<string, number | null>);
  }

  const samples: AccuracySample[] = [];
  let unevaluable = 0;

  for (const r of movieRatings) {
    const profile = profileById.get(r.userId);
    const movie = movieById.get(r.movieId);
    const agg = movieAggs.get(r.movieId);
    if (!profile || !movie || !agg) { unevaluable++; continue; }
    const loo = leaveOneOut(agg, r as unknown as Record<string, number | null>);
    const predicted = predictFromAggregate(loo, profile, movie.genres);
    if (predicted == null || r.ratistRating == null) { unevaluable++; continue; }
    samples.push({
      mediaType: "movie",
      ratingId: r.id,
      userId: r.userId,
      titleId: r.movieId,
      tmdbId: movie.tmdbId,
      title: movie.title,
      createdAt: r.createdAt,
      predicted,
      actual: r.ratistRating,
      absError: Math.abs(predicted - r.ratistRating),
    });
  }
  for (const r of tvRatings) {
    const profile = profileById.get(r.userId);
    const show = showById.get(r.tvShowId);
    const agg = showAggs.get(r.tvShowId);
    if (!profile || !show || !agg) { unevaluable++; continue; }
    const loo = leaveOneOut(agg, r as unknown as Record<string, number | null>);
    const predicted = predictFromAggregate(loo, profile, show.genres);
    if (predicted == null || r.ratistRating == null) { unevaluable++; continue; }
    samples.push({
      mediaType: "tv",
      ratingId: r.id,
      userId: r.userId,
      titleId: r.tvShowId,
      tmdbId: show.tmdbId,
      title: show.name,
      createdAt: r.createdAt,
      predicted,
      actual: r.ratistRating,
      absError: Math.abs(predicted - r.ratistRating),
    });
  }

  return buildReportFromSamples(samples, movieRatings.length + tvRatings.length, unevaluable);
}
