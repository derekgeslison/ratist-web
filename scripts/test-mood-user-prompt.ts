import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";

const PROMPTS = [
  "a mind-bending but feel good movie",
  "a dark TV show",
  "something scary",
  "a tearjerker romance",
  "nothing but vibes, just chill",
];

async function main() {
  for (const p of PROMPTS) {
    const f = await extractRecommendationFilters(p);
    console.log(`> ${p}`);
    console.log(`  moods=${JSON.stringify(f.moods)}  genres=${JSON.stringify(f.genres)}  mediaType=${f.mediaType}`);
  }
}
main();
