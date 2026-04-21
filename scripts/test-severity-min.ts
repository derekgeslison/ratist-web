import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractCollectionFilters } from "../lib/ai/collection-filters";

const PROMPTS = [
  "a very violent war movie",
  "gore porn like Saw",
  "a really sexy steamy movie",
  "terrifying horror that will haunt me",
  "stoner comedies with lots of drugs",
  "dark and disturbing psychological movies",
  "brutal action flicks",
  "erotic thrillers with lots of nudity",
  "heavy horror, peak horror genre",
  "violent but not gory action",
];

(async () => {
  for (const p of PROMPTS) {
    const f = await extractCollectionFilters(p);
    const mins = {
      V: f.minViolence, S: f.minSexualContent, L: f.minLanguageSubstance, Sc: f.minScaryIntense, T: f.minSensitiveThemes,
    };
    const maxes = {
      V: f.maxViolence, S: f.maxSexualContent, L: f.maxLanguageSubstance, Sc: f.maxScaryIntense, T: f.maxSensitiveThemes,
    };
    console.log(`> ${p}`);
    console.log(`  min=${JSON.stringify(mins)}  max=${JSON.stringify(maxes)}`);
  }
})();
