// Retest the three specific bugs the user reported:
// 1) "last N years" year-range logic
// 2) MPAA/TV rating extraction
// 3) (no client-side test; pill integration is UI-only)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

async function main() {
  console.log("Today:", new Date().toISOString().slice(0, 10), "current year:", new Date().getFullYear());
  console.log();
  const { extractRecommendationFilters } = await import("../lib/ai/recommend-filters");
  const cases = [
    "movies set in the future, no foreign language and no romance please. Made in the last 10 years",
    "R-rated action movies",
    "TV-MA horror shows",
    "PG-13 or lower comedies",
    "films released in the last 5 years",
    "past 3 years sci-fi",
    "recent horror, rated R",
    "NC-17 thrillers",
    "family-friendly movies",
    "released in the last decade",
    "movies from the last 10 years that are rated R",
  ];
  for (const prompt of cases) {
    const f = await extractRecommendationFilters(prompt);
    console.log(`> ${prompt}`);
    console.log(`  yearFrom=${f.yearFrom}  yearTo=${f.yearTo}  mpaaRatings=${JSON.stringify(f.mpaaRatings)}  genres=${JSON.stringify(f.genres)}  excludeGenres=${JSON.stringify(f.excludeGenres)}  era=${JSON.stringify(f.era)}`);
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
