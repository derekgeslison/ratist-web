// Tests whether the AI (a) maps freeform tone words to existing moods,
// (b) leaves moods empty when no tone is stated, (c) handles multi-mood
// prompts, and (d) doesn't force-fit when nothing matches.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";

const PROMPTS = [
  // Tone not in vocabulary — AI should map to closest
  "something comforting like a warm hug",     // → feel-good
  "a mean-spirited dark comedy",              // → dark + funny
  "wholesome shows",                          // → feel-good
  "something trippy",                         // → mind-bending
  "a cathartic sad movie",                    // → tearjerker
  "nihilistic and bleak",                     // → dark
  "pretentious arthouse stuff",               // → offbeat (or thought-provoking)
  "a wholesome Christmas movie",              // → feel-good
  "something gut-wrenching and intense",      // → dark, edge-of-seat
  // No tone at all
  "a comedy from the 90s",                    // → no mood
  "Tom Hanks movies",                         // → no mood
  "sci-fi I haven't seen",                    // → no mood (maybe "mind-bending"?)
  // Multiple moods
  "a feel-good romantic comedy",              // → feel-good + romantic + funny
  "a dark, mind-bending thriller",            // → dark + mind-bending + edge-of-seat
  // Gibberish
  "zxcv asdf",
];

async function main() {
  for (const p of PROMPTS) {
    const f = await extractRecommendationFilters(p);
    console.log(`> ${p}`);
    console.log(`  mediaType=${f.mediaType}  genres=${JSON.stringify(f.genres)}  moods=${JSON.stringify(f.moods)}  excludeGenres=${JSON.stringify(f.excludeGenres)}`);
  }
}
main();
