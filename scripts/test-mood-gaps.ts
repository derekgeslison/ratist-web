// Test what the two AI extractors do with mood-driven queries — especially
// the ones that would normally "break" because TMDB doesn't have the expected
// genre on TV (Romance, Horror) or no genre exists at all (feel-good, dark).
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const PROMPTS = [
  // Genre-gap: TV doesn't have these
  "a romantic TV show",
  "a horror TV show",
  "a thriller series",
  "a history documentary series",
  // Moods without direct genre
  "a feel-good movie",
  "a feel-good show about friendship",
  "a dark thriller movie",
  "a dark TV show",
  "a thought-provoking documentary",
  "a mind-bending sci-fi",
  "a tearjerker movie",
  "an edge-of-seat action show",
  // Natural combinations
  "something romantic to watch with my partner tonight",
  "a scary show for Halloween",
];

function fmt(o: unknown) { return JSON.stringify(o); }

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ERROR: ANTHROPIC_API_KEY not set."); process.exit(1); }
  console.log("=".repeat(80));
  console.log("RECOMMEND extraction");
  console.log("=".repeat(80));
  for (const p of PROMPTS) {
    const f = await extractRecommendationFilters(p);
    const relevant = {
      mediaType: f.mediaType,
      genres: f.genres,
      moods: f.moods,
      excludeGenres: f.excludeGenres,
    };
    console.log(`> ${p}`);
    console.log(`  ${fmt(relevant)}`);
  }
  console.log("\n" + "=".repeat(80));
  console.log("COLLECTIONS extraction");
  console.log("=".repeat(80));
  for (const p of PROMPTS) {
    const f = await extractCollectionFilters(p);
    const relevant = {
      mediaType: f.mediaType,
      genres: f.genres,
      moods: f.moods,
      textQuery: f.textQuery,
      excludeGenres: f.excludeGenres,
    };
    console.log(`> ${p}`);
    console.log(`  ${fmt(relevant)}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
