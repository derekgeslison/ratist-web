import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// PROPOSED mapping — includes TMDB Animation (16) → genreAnimation
const TMDB_GENRE_TO_PROFILE: Record<number, string> = {
  28: "genreAction", 12: "genreAction", 16: "genreAnimation", 35: "genreComedy", 80: "genreCrime",
  99: "genreDocumentary", 18: "genreDrama", 10751: "genreFamily", 14: "genreFantasy",
  36: "genreHistorical", 27: "genreHorror", 10402: "genreMusical", 9648: "genreMystery",
  10749: "genreRomance", 878: "genreScifi", 53: "genreThriller", 10752: "genreHistorical",
  37: "genreWestern",
};

function getProfileGenreKeys(tmdbGenreId: number): string[] {
  switch (tmdbGenreId) {
    case 10759: return ["genreAction"];
    case 10765: return ["genreScifi", "genreFantasy"];
    case 10768: return ["genreHistorical"];
    case 10762: return ["genreFamily"];
    default: {
      const k = TMDB_GENRE_TO_PROFILE[tmdbGenreId];
      return k ? [k] : [];
    }
  }
}

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;

const LIKED_THRESHOLD = 7.5;

function avgArr(a: number[]): number { return a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length; }
function upscale(raw: Record<string, number>): Record<string, number> {
  const max = Math.max(...Object.values(raw));
  if (max <= 0) return raw;
  const scale = 10 / max;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v * scale]));
}

const FOCUSED_CATEGORIES = {
  narrativeFocused:     ["plot", "storytelling", "pacingClimax", "premiseOriginality"],
  characterFocused:     ["relatability", "characterDev", "dialogueScripting"],
  messageFocused:       ["overallEmotion", "meaning", "movingness"],
  cinematicFocused:     ["cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound"],
  performanceFocused:   ["casting", "actingQuality", "blockingChoreo"],
  entertainmentFocused: ["appeal", "pacingClimax"],
} as const;

type FocusedKey = keyof typeof FOCUSED_CATEGORIES;

function subFieldAvg(obj: Record<string, number | null | undefined>, fields: readonly string[]): number | null {
  const vals = fields
    .map((f) => obj[f])
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const USER_NAME = "Derek Geslison";
const TMDB_IDS = [1226863, 15121, 508965, 604079];

async function main() {
  const user = await prisma.user.findFirst({
    where: { name: USER_NAME },
    select: { id: true, name: true },
  });
  if (!user) throw new Error(`User "${USER_NAME}" not found`);

  const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new Error("No UserProfile for Derek");

  console.log(`\n=== Profile: ${user.name} (${user.id}) ===\n`);
  console.log("Component preferences:");
  for (const cat of Object.keys(FOCUSED_CATEGORIES) as FocusedKey[]) {
    console.log(`  ${cat.padEnd(22)} ${(profile[cat] as number).toFixed(2)}`);
  }
  console.log("\nCurrent genre preferences (DB, non-zero only):");
  for (const k of GENRE_KEYS) {
    const v = (profile as unknown as Record<string, number>)[k];
    if (v && v > 0) console.log(`  ${k.padEnd(22)} ${v.toFixed(2)}`);
  }

  // === Simulate what Derek's genre profile WOULD be if genreAnimation existed ===
  // Recompute raw genre scores from all his ratings (movies + TV series-scope)
  // using the proposed mapping (which includes TMDB 16 → genreAnimation),
  // then upscale all 19 keys together.
  console.log("\n=== Simulating profile rebuild with genreAnimation added ===\n");

  const [movieRatings, tvRatings] = await Promise.all([
    prisma.movieRating.findMany({
      where: { userId: user.id },
      select: { movieId: true, overallRating: true },
    }),
    prisma.tVShowRating.findMany({
      where: { userId: user.id, ratingScope: "series" },
      select: { tvShowId: true, overallRating: true },
    }),
  ]);
  const validMovieRatings = movieRatings.filter((r) => r.overallRating != null);
  const validTvRatings = tvRatings.filter((r) => r.overallRating != null);
  const ratedMovieIds = validMovieRatings.map((r) => r.movieId);
  const ratedTvIds = validTvRatings.map((r) => r.tvShowId);

  const [ratedMovieGenres, ratedTvGenres] = await Promise.all([
    ratedMovieIds.length > 0
      ? prisma.movieGenre.findMany({ where: { movieId: { in: ratedMovieIds } }, select: { movieId: true, genreId: true } })
      : Promise.resolve([] as { movieId: string; genreId: number }[]),
    ratedTvIds.length > 0
      ? prisma.tVShowGenre.findMany({ where: { tvShowId: { in: ratedTvIds } }, select: { tvShowId: true, genreId: true } })
      : Promise.resolve([] as { tvShowId: string; genreId: number }[]),
  ]);
  const movieGenresByMovie = new Map<string, number[]>();
  for (const g of ratedMovieGenres) {
    const arr = movieGenresByMovie.get(g.movieId) ?? [];
    arr.push(g.genreId);
    movieGenresByMovie.set(g.movieId, arr);
  }
  const tvGenresByShow = new Map<string, number[]>();
  for (const g of ratedTvGenres) {
    const arr = tvGenresByShow.get(g.tvShowId) ?? [];
    arr.push(g.genreId);
    tvGenresByShow.set(g.tvShowId, arr);
  }

  const genreContributions: Record<string, number[]> = Object.fromEntries(GENRE_KEYS.map((k) => [k, [] as number[]]));
  const unified = [
    ...validMovieRatings.map((r) => ({ overall: r.overallRating!, genreIds: movieGenresByMovie.get(r.movieId) ?? [] })),
    ...validTvRatings.map((r) => ({ overall: r.overallRating!, genreIds: tvGenresByShow.get(r.tvShowId) ?? [] })),
  ];
  for (const rating of unified) {
    const liked = rating.overall >= LIKED_THRESHOLD;
    const hitKeys = new Set<string>();
    for (const tid of rating.genreIds) {
      for (const k of getProfileGenreKeys(tid)) hitKeys.add(k);
    }
    for (const k of GENRE_KEYS) {
      genreContributions[k].push(liked && hitKeys.has(k) ? rating.overall : 0);
    }
  }
  const rawGenres = Object.fromEntries(GENRE_KEYS.map((k) => [k, avgArr(genreContributions[k])])) as Record<string, number>;
  const simulatedGenres = upscale(rawGenres);

  console.log(`Total rated titles (movies+TV): ${unified.length}`);
  console.log(`Animated titles among them: ${unified.filter((u) => u.genreIds.includes(16)).length}`);
  console.log(`Animated titles rated ≥7.5: ${unified.filter((u) => u.genreIds.includes(16) && u.overall >= LIKED_THRESHOLD).length}\n`);

  console.log("Simulated genre profile (after rebuild with Animation included):");
  for (const k of GENRE_KEYS) {
    const sim = simulatedGenres[k] ?? 0;
    const cur = (profile as unknown as Record<string, number>)[k] ?? 0;
    if (sim > 0 || cur > 0) {
      const arrow = Math.abs(sim - cur) >= 0.05 ? `  (was ${cur.toFixed(2)})` : "";
      console.log(`  ${k.padEnd(22)} ${sim.toFixed(2)}${arrow}`);
    }
  }
  // Use simulated genres going forward, but keep component prefs as-is
  // (component math doesn't change when we add a genre key).
  const simulatedProfile = { ...(profile as unknown as Record<string, number>), ...simulatedGenres };

  const movies = await prisma.movie.findMany({
    where: { tmdbId: { in: TMDB_IDS } },
    include: { genres: { include: { genre: true } } },
  });

  if (movies.length === 0) {
    console.log("\n!! None of those tmdbIds are in our DB.");
    return;
  }

  const movieIds = movies.map((m) => m.id);
  const communityAvgs = await prisma.movieRating.groupBy({
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
  });

  const communityMap = new Map(
    communityAvgs.map((c) => [c.movieId, { avg: c._avg as Record<string, number | null>, count: c._count.ratistRating }])
  );

  console.log("\n=== Movies ===\n");

  for (const tmdbId of TMDB_IDS) {
    const movie = movies.find((m) => m.tmdbId === tmdbId);
    if (!movie) {
      console.log(`tmdbId ${tmdbId} — NOT IN DB\n`);
      continue;
    }
    const community = communityMap.get(movie.id);
    console.log(`--- ${movie.title} (tmdb ${tmdbId}) ---`);
    console.log(`  Genres: ${movie.genres.map((g) => `${g.genre.name}(${g.genreId})`).join(", ")}`);
    console.log(`  Community ratist count: ${community?.count ?? 0}`);

    if (!community || community.count === 0) {
      console.log("  -> No community ratings; estimate would be null.\n");
      continue;
    }

    const avg = community.avg;
    let weightedSum = 0;
    let totalWeight = 0;
    console.log("  Category breakdown:");
    for (const [cat, fields] of Object.entries(FOCUSED_CATEGORIES) as [FocusedKey, readonly string[]][]) {
      const catScore = subFieldAvg(avg, fields);
      const userPref = profile[cat] as number;
      const used = catScore != null && userPref > 0;
      if (used) {
        weightedSum += catScore * userPref;
        totalWeight += userPref;
      }
      console.log(`    ${cat.padEnd(22)} community=${catScore == null ? "null" : catScore.toFixed(2)}  pref=${userPref.toFixed(2)}  ${used ? "USED" : "skip"}`);
    }
    if (totalWeight === 0) {
      console.log("  -> totalWeight 0; estimate null.\n");
      continue;
    }
    const componentEstimate = weightedSum / totalWeight;

    // Genre score under the BEFORE world (current production: no Animation key, current DB values)
    const beforeScores: number[] = [];
    const beforeDetail: string[] = [];
    for (const mg of movie.genres) {
      // Use OLD mapping: skip TMDB 16
      if (mg.genreId === 16) continue;
      for (const profileKey of getProfileGenreKeys(mg.genreId)) {
        if (profileKey === "genreAnimation") continue; // shouldn't happen, but defensive
        const v = (profile as unknown as Record<string, number>)[profileKey] ?? 0;
        beforeScores.push(v);
        beforeDetail.push(`${mg.genre.name}→${profileKey}=${v.toFixed(2)}`);
      }
    }
    const beforeGenreScore = beforeScores.length > 0
      ? beforeScores.reduce((a, b) => a + b, 0) / beforeScores.length
      : null;

    // Genre score under the AFTER world (Animation mapped + simulated genre profile)
    const afterRaw: { name: string; key: string; v: number }[] = [];
    for (const mg of movie.genres) {
      for (const profileKey of getProfileGenreKeys(mg.genreId)) {
        const v = simulatedProfile[profileKey] ?? 0;
        afterRaw.push({ name: mg.genre.name, key: profileKey, v });
      }
    }
    const afterGenreScore = afterRaw.length > 0
      ? afterRaw.reduce((a, b) => a + b.v, 0) / afterRaw.length
      : null;
    const afterDetail = afterRaw.map((g) => `${g.name}→${g.key}=${g.v.toFixed(2)}`);

    // === Adaptive rule: detractors (pref < 5) get distance-from-5 halved
    // when community ratistRating average is >= 8.0 ===
    const communityRating = avg.ratistRating ?? null;
    const triggerDampen = communityRating != null && communityRating >= 8.0;
    const dampenedRaw = afterRaw.map((g) => {
      if (triggerDampen && g.v < 5) {
        return { ...g, v: 5 - (5 - g.v) * 0.5 };
      }
      return g;
    });
    const dampenedGenreScore = dampenedRaw.length > 0
      ? dampenedRaw.reduce((a, b) => a + b.v, 0) / dampenedRaw.length
      : null;
    const dampenedDetail = dampenedRaw.map((g, i) => {
      const orig = afterRaw[i].v;
      const lifted = g.v !== orig;
      return `${g.name}→${g.key}=${g.v.toFixed(2)}${lifted ? `*` : ""}`;
    });

    console.log(`  Community ratistRating avg: ${communityRating == null ? "null" : communityRating.toFixed(2)}  ${triggerDampen ? "→ DETRACTOR DAMPEN ACTIVE" : ""}`);
    console.log(`  Genre score BEFORE (no Animation): ${beforeGenreScore == null ? "null" : beforeGenreScore.toFixed(3)}  [${beforeDetail.join(", ")}]`);
    console.log(`  Genre score AFTER  (with Animation): ${afterGenreScore == null ? "null" : afterGenreScore.toFixed(3)}  [${afterDetail.join(", ")}]`);
    console.log(`  Genre score AFTER w/ dampening:     ${dampenedGenreScore == null ? "null" : dampenedGenreScore.toFixed(3)}  [${dampenedDetail.join(", ")}]`);
    console.log(`  Component estimate (raw): ${componentEstimate.toFixed(3)}`);

    const blend = (gs: number | null, compW: number, genW: number) => {
      const raw = gs == null ? componentEstimate : componentEstimate * compW + gs * genW;
      return Math.round(Math.min(10, Math.max(1, raw)) * 10) / 10;
    };
    const pure = Math.round(Math.min(10, Math.max(1, componentEstimate)) * 10) / 10;

    console.log("  ─────────────────────────────────────────────");
    console.log(`  Current prod (no anim, 90/10):           ${blend(beforeGenreScore, 0.90, 0.10).toFixed(1)}`);
    console.log(`  + Animation only (90/10):                ${blend(afterGenreScore, 0.90, 0.10).toFixed(1)}`);
    console.log(`  + Animation + 70/30 (flat):              ${blend(afterGenreScore, 0.70, 0.30).toFixed(1)}`);
    console.log(`  + Animation + 70/30 + detractor dampen:  ${blend(dampenedGenreScore, 0.70, 0.30).toFixed(1)}   <-- proposed`);
    console.log(`  (Component-only baseline:                ${pure.toFixed(1)})`);
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
