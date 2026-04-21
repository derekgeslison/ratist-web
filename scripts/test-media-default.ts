import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";

const PROMPTS = [
  "cozy rom-com for a bad day",
  "something scary",
  "a slow burn sci-fi I can finish in a night",
  "a Christmas thing",
  "I just want to laugh",
  "a good thriller",
  "pick me something like Inception",
  "a good Tom Hanks movie",
  "a binge-worthy show",
  "sitcoms for background viewing",
  "an action-packed blockbuster",
  "a tear-jerker drama",
];

(async () => {
  for (const p of PROMPTS) {
    const f = await extractRecommendationFilters(p);
    console.log(`${p.padEnd(55)} → mediaType: ${f.mediaType}`);
  }
})();
