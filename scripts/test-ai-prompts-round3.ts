// Round 3: retest Christmas era bug + brand new prompts.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const RECOMMEND_PROMPTS = [
  "a Christmas movie", // retest — expect era: []
  "give me something weird",
  "a movie with a great soundtrack",
  "something I can watch while I do dishes",
  "a war movie but not too graphic",
  "a fast and furious type movie",
  "something romantic but not too sappy",
  "a hidden indie gem",
  "a good documentary about food",
  "a movie where a kid has superpowers",
  "something to watch after a long day",
  "a slow burn horror",
];

const COLLECTION_PROMPTS = [
  "best superhero movies of all time",
  "underrated sci-fi from the 80s",
  "feel-good shows about friendship",
  "movies that made me question reality",
  "true crime documentaries",
  "romantic comedies that aren't formulaic",
  "Japanese horror movies",
  "binge-worthy shows under 3 seasons",
  "prestige westerns",
  "mind-bending short films", // tricky — short films may not work with discover
  "movies that teach you something",
  "sitcoms for background viewing",
];

function fmt(obj: unknown) { return JSON.stringify(obj, null, 2).replace(/\n/g, "\n  "); }

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ERROR: ANTHROPIC_API_KEY not set."); process.exit(1); }
  console.log("=".repeat(78));
  console.log("RECOMMEND — Round 3");
  console.log("=".repeat(78));
  for (const p of RECOMMEND_PROMPTS) {
    try {
      const f = await extractRecommendationFilters(p);
      console.log(`\n> ${p}\n  ${fmt(f)}`);
    } catch (err) {
      console.log(`\n> ${p}\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\n" + "=".repeat(78));
  console.log("COLLECTIONS — Round 3");
  console.log("=".repeat(78));
  for (const p of COLLECTION_PROMPTS) {
    try {
      const f = await extractCollectionFilters(p);
      console.log(`\n> ${p}\n  ${fmt(f)}`);
    } catch (err) {
      console.log(`\n> ${p}\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
