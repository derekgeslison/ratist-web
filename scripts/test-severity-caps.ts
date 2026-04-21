import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const PROMPTS = [
  "gangster movies but nothing too graphic",
  "horror movies without any sex or nudity",
  "family-friendly adventure movies",
  "clean comedies no cursing",
  "thrillers but nothing scary",
  "Halloween movies for a 10 year old",
  "movies with no animal deaths",
  "sci-fi but nothing too dark or violent",
  "rom-coms (no drugs or cursing please)",
  "classic action movies",
];

(async () => {
  for (const p of PROMPTS) {
    const f = await extractCollectionFilters(p);
    const caps = {
      V: f.maxViolence,
      S: f.maxSexualContent,
      L: f.maxLanguageSubstance,
      Sc: f.maxScaryIntense,
      T: f.maxSensitiveThemes,
    };
    console.log(`${p.padEnd(55)} → ${JSON.stringify(caps)}`);
  }
})();
