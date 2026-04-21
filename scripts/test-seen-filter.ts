import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const PROMPTS = [
  "good rewatchable sci-fi movies that I have already seen",
  "my top comfort movies to rewatch",
  "highly rated movies I've already watched",
  "sci-fi gems I haven't seen yet",
  "classic 90s comedies",
  "best horror movies I might have missed",
  "movies from my list",
];

(async () => {
  for (const p of PROMPTS) {
    const f = await extractCollectionFilters(p);
    console.log(`${p.padEnd(60)} → seenFilter: ${f.seenFilter}`);
  }
})();
