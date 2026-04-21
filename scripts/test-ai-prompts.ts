// Stress-test the two filter-extraction prompts against a dozen realistic
// user inputs. Run with:
//   npx tsx scripts/test-ai-prompts.ts
// Requires ANTHROPIC_API_KEY in the environment (e.g. via .env.local).

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const RECOMMEND_PROMPTS = [
  "a quick movie within the last few years that is a romance",
  "a slow-burn sci-fi I can finish in a night",
  "cozy rom-com for a bad day",
  "something dark and thought-provoking like There Will Be Blood",
  "mindless fun action for a Friday night",
  "an 80s horror movie",
  "tear-jerker drama based on a true story",
  "a sci-fi movie with some romance elements that is highly rated",
  "kid-friendly animation my 5-year-old will like",
  "heist movie streaming on Netflix",
  "epic fantasy that's at least 3 hours long",
  "a recent comedy that's not a sequel or a reboot",
];

const COLLECTION_PROMPTS = [
  "Classic gangster movies rated above 8 that I haven't seen yet",
  "TV shows that are highly rated that are placed in the future",
  "Scorsese-style crime dramas from the 70s and 80s",
  "Horror movies from the 2010s I might have missed",
  "Feel-good 90s comedies",
  "Mind-bending sci-fi with above-average ratings",
  "Cult classic comedies from any era",
  "Oscar-winning dramas from the last decade",
  "Noir detective films",
  "Anime movies with high ratings",
  "Kid-friendly animated movies from Disney or Pixar",
  "Time travel movies I haven't seen",
];

function fmt(obj: unknown) {
  return JSON.stringify(obj, null, 2).replace(/\n/g, "\n  ");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local or export it first.");
    process.exit(1);
  }

  console.log("=".repeat(78));
  console.log("RECOMMEND — What Should I Watch (extract filters)");
  console.log("=".repeat(78));
  for (const prompt of RECOMMEND_PROMPTS) {
    try {
      const filters = await extractRecommendationFilters(prompt);
      console.log(`\n> ${prompt}`);
      console.log(`  ${fmt(filters)}`);
    } catch (err) {
      console.log(`\n> ${prompt}`);
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n" + "=".repeat(78));
  console.log("COLLECTIONS — AI collection filters");
  console.log("=".repeat(78));
  for (const prompt of COLLECTION_PROMPTS) {
    try {
      const filters = await extractCollectionFilters(prompt);
      console.log(`\n> ${prompt}`);
      console.log(`  ${fmt(filters)}`);
    } catch (err) {
      console.log(`\n> ${prompt}`);
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
