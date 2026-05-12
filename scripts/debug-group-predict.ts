/**
 * Diagnose why /recommend group mode shows null scores for one member
 * but not the other. Dumps both users' UserProfile snapshots, rating
 * breakdowns, and runs the SAME math predictRatingsBatch uses (the
 * lib/profile.ts getBatchScoreEstimates path) inline so we avoid the
 * @/lib/prisma singleton-vs-env-load ordering issue scripts run into.
 *
 * Run: npx tsx scripts/debug-group-predict.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const NAMES = ["Derek Geslison", "Jeremy Geslison"];

const FOCUSED_CATEGORIES = {
  narrativeFocused: ["plot", "storytelling", "pacingClimax", "premiseOriginality"],
  characterFocused: ["relatability", "characterDev", "dialogueScripting"],
  messageFocused: ["overallEmotion", "meaning", "movingness"],
  cinematicFocused: ["cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound"],
  performanceFocused: ["casting", "actingQuality", "blockingChoreo"],
  entertainmentFocused: ["appeal"],
} as const;
type FocusedKey = keyof typeof FOCUSED_CATEGORIES;

const TMDB_GENRE_TO_PROFILE: Record<number, string> = {
  28: "genreAction", 12: "genreBookAdapt", 16: "genreFamily", 35: "genreComedy",
  80: "genreCrime", 99: "genreDocumentary", 18: "genreDrama", 10751: "genreFamily",
  14: "genreFantasy", 36: "genreHistorical", 27: "genreHorror", 10402: "genreMusical",
  9648: "genreMystery", 10749: "genreRomance", 878: "genreScifi", 53: "genreThriller",
  10752: "genreHistorical", 37: "genreWestern",
};

function subFieldAvg(obj: Record<string, number | null | undefined>, fields: readonly string[]): number | null {
  const vals = fields.map((f) => obj[f]).filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function dumpUser(name: string) {
  const u = await prisma.user.findFirst({
    where: { name },
    include: {
      profile: true,
      _count: { select: { ratings: true, tvShowRatings: true } },
    },
  });
  if (!u) { console.log(`\n=== ${name}: NOT FOUND ===`); return null; }

  console.log(`\n=== ${name} (${u.id}) ===`);
  console.log(`Movie ratings: ${u._count.ratings}, TV: ${u._count.tvShowRatings}`);
  const breakdown = await prisma.movieRating.groupBy({
    by: ["reviewType", "importSource"],
    where: { userId: u.id },
    _count: { _all: true },
  });
  for (const b of breakdown) {
    console.log(`  reviewType=${b.reviewType ?? "(null)"}, importSource=${b.importSource ?? "(null)"}: ${b._count._all}`);
  }
  if (!u.profile) { console.log("(no UserProfile row)"); return u; }
  const p = u.profile;
  console.log(`Components:`);
  for (const k of Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]) {
    console.log(`  ${k}: ${(p[k] as number).toFixed(2)}`);
  }
  const hasComponent = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some((k) => (p[k] as number) > 0);
  console.log(`hasProfile (any component > 0): ${hasComponent}`);
  return u;
}

async function predictSample(userId: string, label: string) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) { console.log(`\n${label}: no profile, can't predict`); return; }
  const hasProfile = (Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]).some((k) => (profile[k] as number) > 0);
  if (!hasProfile) { console.log(`\n${label}: profile has 0 components, predictor returns null for all`); return; }

  const movies = await prisma.movie.findMany({
    where: { popularity: { gte: 50 } },
    orderBy: { popularity: "desc" },
    take: 10,
    include: { genres: true },
  });
  const movieIds = movies.map((m) => m.id);

  const communityAvgs = await prisma.movieRating.groupBy({
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
    _count: { ratistRating: true },
  });
  const communityMap = new Map(communityAvgs.map((c) => [c.movieId, { avg: c._avg as Record<string, number | null>, count: c._count.ratistRating }]));

  console.log(`\nPredictions for ${label}:`);
  let nonNull = 0;
  for (const movie of movies) {
    const community = communityMap.get(movie.id);
    if (!community || community.count === 0) {
      console.log(`  ${movie.title}: NULL (no community data, count=${community?.count ?? 0})`);
      continue;
    }
    let weightedSum = 0, totalWeight = 0;
    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const movieCategoryScore = subFieldAvg(community.avg, fields);
      const userPref = profile[cat] as number;
      if (movieCategoryScore != null && userPref > 0) {
        weightedSum += movieCategoryScore * userPref;
        totalWeight += userPref;
      }
    }
    if (totalWeight === 0) {
      console.log(`  ${movie.title}: NULL (no component overlap)`);
      continue;
    }
    const componentEstimate = weightedSum / totalWeight;
    const genreScores: number[] = [];
    for (const mg of movie.genres) {
      const profileKey = TMDB_GENRE_TO_PROFILE[mg.genreId];
      if (profileKey) genreScores.push((profile as unknown as Record<string, number>)[profileKey] ?? 0);
    }
    let estimate = componentEstimate;
    if (genreScores.length > 0) {
      const genreScore = genreScores.reduce((a, b) => a + b, 0) / genreScores.length;
      estimate = componentEstimate * 0.9 + genreScore * 0.1;
    }
    const final = Math.round(Math.min(10, Math.max(1, estimate)) * 10) / 10;
    nonNull++;
    console.log(`  ${movie.title}: ${final.toFixed(2)} (community count=${community.count}, comp=${componentEstimate.toFixed(2)}, genre avg=${genreScores.length > 0 ? (genreScores.reduce((a,b)=>a+b,0)/genreScores.length).toFixed(2) : "n/a"})`);
  }
  console.log(`Non-null: ${nonNull}/${movies.length}`);
}

async function main() {
  const users: { name: string; id: string }[] = [];
  for (const name of NAMES) {
    const u = await dumpUser(name);
    if (u) users.push({ name, id: u.id });
  }
  for (const u of users) {
    await predictSample(u.id, u.name);
  }
}

void main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
