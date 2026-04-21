// Round-2 test: retry the ones that broke + 9 new prompts per feature.
// Run: npx tsx scripts/test-ai-prompts-round2.ts

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const RECOMMEND_PROMPTS = [
  // Retest — these broke or underperformed last round
  "a Halloween movie but nothing too scary",
  "something to watch with my mom, nothing too dark",
  "what should I watch with my teenager",
  // New
  "a chill animated movie but not for little kids",
  "are there any good sci-fi shows on Hulu",
  "smth fun and not too long",
  "background noise while I work",
  "a Christmas movie",
  "a Meryl Streep movie",
  "a movie where the guy relives the same day over and over",
  "a feel-good drama, no war stuff or crime",
  "a movie that takes place in space but isn't star wars and has good visuals",
];

const COLLECTION_PROMPTS = [
  // Retest — Halloween + kids to confirm negative-constraint rule
  "Halloween movies for families with young kids, nothing too scary",
  // New
  "cold war era spy thrillers",
  "shows with strong female leads",
  "Christopher Nolan movies I haven't seen",
  "uplifting sports underdog stories",
  "movies with twist endings",
  "apocalypse and end-of-world films",
  "coming of age teen movies from the 2010s",
  "foreign films with amazing cinematography",
  "slice of life anime",
  "political thrillers",
  "musicals that won Oscars",
];

function fmt(obj: unknown) { return JSON.stringify(obj, null, 2).replace(/\n/g, "\n  "); }

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ERROR: ANTHROPIC_API_KEY not set."); process.exit(1); }
  console.log("=".repeat(78));
  console.log("RECOMMEND — Round 2");
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
  console.log("COLLECTIONS — Round 2");
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
