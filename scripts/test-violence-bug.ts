import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  const { extractRecommendationFilters } = await import("../lib/ai/recommend-filters");
  const { prisma } = await import("../lib/prisma");
  const prompts = [
    "an action movie that is rated R but isn't too violent",
    "R-rated action, not too violent",
    "violent but clean",
    "action movie, not too violent",
    "R-rated, minimal violence",
  ];
  for (const p of prompts) {
    const f = await extractRecommendationFilters(p);
    console.log(`> ${p}`);
    console.log(`  mpaa=${JSON.stringify(f.mpaaRatings)}  maxViolence=${f.maxViolence}  minViolence=${f.minViolence}  genres=${JSON.stringify(f.genres)}`);
  }
  // Also — count of MovieParentsGuide entries to assess coverage.
  const count = await prisma.movieParentsGuide.count();
  console.log(`\nMovieParentsGuide cache entries: ${count}`);
  const sample = await prisma.movieParentsGuide.findMany({ take: 5, select: { tmdbId: true, violenceSeverity: true } });
  console.log("Sample entries:", sample);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
