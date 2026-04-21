// Second-pass test harness using conversational, "regular user" phrasing —
// no genre terminology, more situation/mood/reference-driven.
// Run: npx tsx scripts/test-ai-prompts-natural.ts

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const RECOMMEND_PROMPTS = [
  "I just want to turn my brain off and laugh",
  "something to watch with my mom",
  "pick me a movie like Inception",
  "what's a good date night movie",
  "I'm bored and want a thriller",
  "a Halloween movie but nothing too scary",
  "something nostalgic from when I was a kid in the 90s",
  "I need to cry tonight",
  "something short while I eat lunch",
  "a good Tom Hanks movie",
  "what should I watch with my teenager",
  "an underrated gem no one's seen",
];

const COLLECTION_PROMPTS = [
  "movies to watch on a rainy Sunday",
  "bingeable shows for the holidays",
  "the essential films every movie buff should see",
  "shows like Breaking Bad",
  "tearjerker movies that will make me sob",
  "date-night movies my girlfriend and I can both enjoy",
  "action-packed blockbusters from the 2000s",
  "funny animated shows for adults",
  "best Pixar movies I probably haven't seen",
  "movies about toxic relationships",
  "shows I can fall asleep to",
  "prestige HBO-style dramas",
];

function fmt(obj: unknown) { return JSON.stringify(obj, null, 2).replace(/\n/g, "\n  "); }

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set."); process.exit(1);
  }
  console.log("=".repeat(78));
  console.log("RECOMMEND — natural-language prompts");
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
  console.log("COLLECTIONS — natural-language prompts");
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
