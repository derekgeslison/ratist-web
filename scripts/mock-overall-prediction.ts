/**
 * One-off read-only experiment: compare the current method's predicted
 * ratistRating against a proposed "predict the overall rating directly"
 * method, for a handful of TMDB IDs.
 *
 * Standalone Prisma client (matches scripts/debug-group-predict.ts) so
 * we don't trip the lib/prisma "server-only" guard from outside Next.js.
 * The current-method math is inlined here from lib/profile.ts so the
 * comparison is apples-to-apples without crossing the server-only wall.
 *
 * Run from web/:  npx tsx scripts/mock-overall-prediction.ts <tmdbId> [tmdbId ...]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = "geslisond@gmail.com";

// ── Mirror of lib/profile.ts focused-categories + math ────────────────
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

const TMDB_GENRE_TO_PROFILE: Record<number, string> = {
  28: "genreAction", 12: "genreAction", 16: "genreAnimation", 35: "genreComedy",
  80: "genreCrime", 99: "genreDocumentary", 18: "genreDrama", 10751: "genreFamily",
  14: "genreFantasy", 36: "genreHistorical", 27: "genreHorror", 10402: "genreMusical",
  9648: "genreMystery", 10749: "genreRomance", 878: "genreScifi", 53: "genreThriller",
  10752: "genreHistorical", 37: "genreWestern",
};

const COMPONENT_WEIGHT = 0.7;
const GENRE_WEIGHT = 0.3;

function subFieldAvg(obj: Record<string, number | null | undefined>, fields: readonly string[]): number | null {
  const vals = fields.map((f) => obj[f]).filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeGenreScore(
  profile: Record<string, number>,
  genres: { genreId: number }[],
  communityAvgRatist: number | null,
): number | null {
  const prefs = genres
    .map((g) => TMDB_GENRE_TO_PROFILE[g.genreId])
    .filter((k): k is string => !!k)
    .map((k) => profile[k] ?? 0)
    .filter((v) => v > 0);
  if (prefs.length === 0) return null;
  const avg = prefs.reduce((a, b) => a + b, 0) / prefs.length;
  // Detractor dampening when community thinks it's a banger (>=8).
  if (communityAvgRatist != null && communityAvgRatist >= 8 && avg < 5) {
    return Math.min(10, communityAvgRatist - (5 - avg));
  }
  return avg;
}

// Current method, inlined from lib/profile.ts getScoreEstimate.
async function currentMethodPrediction(targetUserId: string, movieId: string): Promise<number | null> {
  const [profile, communityAvg, movie] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: targetUserId } }),
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
    prisma.movie.findUnique({ where: { id: movieId }, include: { genres: true } }),
  ]);

  if (!profile) return null;
  if (communityAvg._count.ratistRating === 0) return null;
  const hasProfile = COMPONENT_KEYS.some((k) => (profile[k] as number) > 0);
  if (!hasProfile) return null;

  const avg = communityAvg._avg as Record<string, number | null>;
  let weightedSum = 0, totalWeight = 0;
  for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
    const movieCategoryScore = subFieldAvg(avg as Record<string, number | null | undefined>, fields);
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
    const genreScore = computeGenreScore(profile as unknown as Record<string, number>, movie.genres, avg.ratistRating ?? null);
    if (genreScore != null) {
      estimate = componentEstimate * COMPONENT_WEIGHT + genreScore * GENRE_WEIGHT;
    }
  }
  return Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10;
}

// ── Proposed method: similarity-weighted overall ──────────────────────
function dimensionSimilarity(a: number, b: number): number {
  return (10 - Math.abs(a - b)) / 10;
}

function userSimilarity(a: Record<FocusedKey, number>, b: Record<FocusedKey, number>): number {
  let sum = 0, n = 0;
  for (const k of COMPONENT_KEYS) {
    if (a[k] > 0 || b[k] > 0) {
      sum += dimensionSimilarity(a[k], b[k]);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

async function proposedOverallPrediction(targetVec: Record<FocusedKey, number>, movieId: string) {
  const ratings = await prisma.movieRating.findMany({
    where: { movieId, excluded: false, overallRating: { not: null } },
    select: {
      overallRating: true,
      ratistRating: true,
      user: {
        select: {
          id: true,
          profile: {
            select: {
              narrativeFocused: true, characterFocused: true, messageFocused: true,
              cinematicFocused: true, performanceFocused: true, entertainmentFocused: true,
            },
          },
        },
      },
    },
  });

  const rows: { overall: number; sim: number }[] = [];
  for (const r of ratings) {
    if (!r.user.profile) continue;
    const theirVec = {
      narrativeFocused: r.user.profile.narrativeFocused,
      characterFocused: r.user.profile.characterFocused,
      messageFocused: r.user.profile.messageFocused,
      cinematicFocused: r.user.profile.cinematicFocused,
      performanceFocused: r.user.profile.performanceFocused,
      entertainmentFocused: r.user.profile.entertainmentFocused,
    } as Record<FocusedKey, number>;
    const hasSignal = Object.values(theirVec).some((v) => v > 0);
    if (!hasSignal) continue;
    const sim = userSimilarity(targetVec, theirVec);
    if (sim <= 0) continue;
    rows.push({ overall: r.overallRating as number, sim });
  }

  if (rows.length === 0) return { prediction: null, raterCount: 0, avgOverall: null };

  // Weighted by similarity^2 so close-taste raters dominate over fringe.
  const num = rows.reduce((s, r) => s + r.overall * Math.pow(r.sim, 2), 0);
  const den = rows.reduce((s, r) => s + Math.pow(r.sim, 2), 0);
  const weighted = den > 0 ? num / den : null;
  const flatAvg = rows.reduce((s, r) => s + r.overall, 0) / rows.length;

  return {
    prediction: weighted != null ? Math.round(weighted * 10) / 10 : null,
    raterCount: rows.length,
    avgOverall: Math.round(flatAvg * 10) / 10,
  };
}

async function analyzeOne(tmdbId: number, targetUserId: string, targetVec: Record<FocusedKey, number>) {
  const [movie, show] = await Promise.all([
    prisma.movie.findUnique({ where: { tmdbId }, select: { id: true, title: true } }),
    prisma.tVShow.findUnique({ where: { tmdbId }, select: { id: true, name: true } }),
  ]);

  if (!movie && !show) {
    console.log(`\ntmdbId ${tmdbId}: not in DB (TMDB sync hasn't happened)`);
    return;
  }
  if (show && !movie) {
    console.log(`\ntmdbId ${tmdbId} ("${show.name}", TV show): script is movie-only for now; skipping.`);
    return;
  }
  if (!movie) return;

  console.log(`\n──── ${movie.title} (tmdbId ${tmdbId}) ────`);

  const [current, proposed, actual, communityAgg] = await Promise.all([
    currentMethodPrediction(targetUserId, movie.id),
    proposedOverallPrediction(targetVec, movie.id),
    prisma.movieRating.findUnique({
      where: { userId_movieId: { userId: targetUserId, movieId: movie.id } },
      select: { ratistRating: true, overallRating: true },
    }),
    prisma.movieRating.aggregate({
      where: { movieId: movie.id, excluded: false },
      _avg: { ratistRating: true, overallRating: true },
      _count: { ratistRating: true, overallRating: true },
    }),
  ]);

  const fmt = (v: number | null | undefined) => v == null ? "—" : v.toFixed(1);

  console.log(`  Community: ratistRating avg ${fmt(communityAgg._avg.ratistRating)} (n=${communityAgg._count.ratistRating}), overall avg ${fmt(communityAgg._avg.overallRating)} (n=${communityAgg._count.overallRating})`);
  console.log(`  CURRENT  method → predicted ratistRating:   ${fmt(current)}`);
  console.log(`  PROPOSED method → predicted overall:        ${fmt(proposed.prediction)}    [${proposed.raterCount} similar-weighted raters, flat avg ${fmt(proposed.avgOverall)}]`);
  if (proposed.prediction != null && current != null) {
    const delta = proposed.prediction - current;
    console.log(`  Δ (proposed overall − current ratist):      ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`);
  }
  if (actual) {
    console.log(`  YOUR actual ratistRating: ${fmt(actual.ratistRating)},  YOUR actual overall: ${fmt(actual.overallRating)}`);
  } else {
    console.log(`  (You haven't rated this — pure prediction comparison.)`);
  }
}

async function main() {
  const args = process.argv.slice(2).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/mock-overall-prediction.ts <tmdbId> [tmdbId ...]");
    process.exit(1);
  }

  const target = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: {
      id: true,
      name: true,
      profile: {
        select: {
          narrativeFocused: true, characterFocused: true, messageFocused: true,
          cinematicFocused: true, performanceFocused: true, entertainmentFocused: true,
        },
      },
    },
  });
  if (!target || !target.profile) {
    console.error(`Target user ${TARGET_EMAIL} not found or has no profile`);
    process.exit(1);
  }

  const targetVec = {
    narrativeFocused: target.profile.narrativeFocused,
    characterFocused: target.profile.characterFocused,
    messageFocused: target.profile.messageFocused,
    cinematicFocused: target.profile.cinematicFocused,
    performanceFocused: target.profile.performanceFocused,
    entertainmentFocused: target.profile.entertainmentFocused,
  } as Record<FocusedKey, number>;

  console.log(`Target user: ${target.name} (${TARGET_EMAIL})`);
  console.log(`Profile components:`);
  for (const k of COMPONENT_KEYS) console.log(`  ${k.padEnd(22)} ${targetVec[k].toFixed(2)}`);

  for (const tmdbId of args) {
    try { await analyzeOne(tmdbId, target.id, targetVec); }
    catch (err) { console.error(`Error on ${tmdbId}:`, err); }
  }

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
