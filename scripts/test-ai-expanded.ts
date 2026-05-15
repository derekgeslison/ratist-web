// Comprehensive prompt battery covering every dimension the AI should extract.
// Runs both tools (recommend + collection) against realistic user phrasings
// so we can spot gaps, over-triggers, and mis-mappings.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";

type Kind = "recommend" | "collection" | "both";
interface TestCase { prompt: string; kind?: Kind; expect?: string; }

const CASES: TestCase[] = [
  // ── The user's actual failing prompt ────────────────────────────
  { prompt: "sci-fi/romance movies I haven't seen, no anime or foreign films", kind: "collection", expect: "excludeAnime + originalLanguage=[en]" },

  // ── Language / origin ────────────────────────────────────────────
  { prompt: "Korean thrillers", kind: "both", expect: "originalLanguage=[ko] + Thriller" },
  { prompt: "Bollywood musicals", kind: "both", expect: "originalLanguage=[hi] + Music" },
  { prompt: "Japanese horror", kind: "both", expect: "originalLanguage=[ja] + Horror" },
  { prompt: "give me some K-drama", kind: "both", expect: "ko + mediaType=tv" },
  { prompt: "French new wave films", kind: "both", expect: "originalLanguage=[fr]" },
  { prompt: "Italian cinema from the 70s", kind: "both", expect: "it + year bucket" },
  { prompt: "Spanish-language horror", kind: "both", expect: "es + Horror" },
  { prompt: "foreign films", kind: "both", expect: "excludeOriginalLanguages=[en]" },
  { prompt: "international cinema, subtitled", kind: "both", expect: "excludeOriginalLanguages=[en]" },
  { prompt: "only English-language stuff", kind: "both", expect: "originalLanguage=[en]" },
  { prompt: "no subtitles please", kind: "both", expect: "originalLanguage=[en]" },

  // ── Anime (compound) ─────────────────────────────────────────────
  { prompt: "anime recommendations", kind: "both", expect: "ja + Animation" },
  { prompt: "no anime", kind: "both", expect: "excludeAnime=true, NOT excludeGenres=Animation" },
  { prompt: "I hate anime, give me good animated movies", kind: "both", expect: "excludeAnime=true + genre Animation kept" },
  { prompt: "animated movies but not Japanese anime", kind: "both", expect: "genre Animation + excludeAnime=true" },
  { prompt: "no animation", kind: "both", expect: "excludeGenres=[Animation] (full exclusion, not just anime)" },

  // ── Year range (precise vs buckets) ──────────────────────────────
  { prompt: "movies from 1995", kind: "both", expect: "yearFrom=1995, yearTo=1995" },
  { prompt: "films released between 1985 and 1995", kind: "both", expect: "yearFrom=1985, yearTo=1995" },
  { prompt: "something from the late 90s", kind: "recommend", expect: "era=90s (not precise year)" },
  { prompt: "before 2010", kind: "both", expect: "yearTo=2009" },
  { prompt: "after 2020", kind: "both", expect: "yearFrom=2020" },
  { prompt: "80s classics", kind: "both", expect: "era=80s for recommend, yearFrom/To for collection" },

  // ── Min rating ───────────────────────────────────────────────────
  { prompt: "only really well-rated stuff, like 8+", kind: "both", expect: "minRating=8" },
  { prompt: "top-tier movies, 9 stars or higher", kind: "both", expect: "minRating=9" },
  { prompt: "highly rated thrillers", kind: "both", expect: "minRating set ~7-8" },
  { prompt: "not garbage", kind: "both", expect: "probably no minRating set (too vague)" },

  // ── Runtime (collections, previously missing) ────────────────────
  { prompt: "quick watches under 90 minutes", kind: "collection", expect: "runtime=[short]" },
  { prompt: "marathon epics, 3 hours plus", kind: "collection", expect: "runtime=[epic]" },
  { prompt: "standard-length thrillers", kind: "collection", expect: "runtime=[feature]" },

  // ── Multi-language whitelist ─────────────────────────────────────
  { prompt: "Korean or Japanese action films", kind: "both", expect: "originalLanguage=[ko,ja]" },
  { prompt: "Scandinavian noir", kind: "both", expect: "originalLanguage=[sv,da,no] or similar" },
  { prompt: "European art cinema", kind: "both", expect: "multi-language or nothing" },

  // ── Negations / exclusions we haven't tested ─────────────────────
  { prompt: "no horror, no slasher, no gore", kind: "both", expect: "excludeGenres=[Horror] + maxViolence" },
  { prompt: "family-friendly but not animated", kind: "both", expect: "Family + excludeGenres=[Animation]" },
  { prompt: "scary but no gore, no jumpscares", kind: "both", expect: "Horror + maxViolence + maxScary" },

  // ── Compound realistic prompts ───────────────────────────────────
  { prompt: "Korean horror from the 2010s under 2 hours, highly rated", kind: "collection", expect: "ko + Horror + yearFrom/To + runtime + minRating" },
  { prompt: "wholesome family movies, English only, nothing too scary", kind: "both", expect: "Family + en + maxScary" },
  { prompt: "movies my mom would like except nothing foreign — she hates subtitles", kind: "both", expect: "en + feel-good + maxScary/Sensitive" },
  { prompt: "dark psychological thrillers, 8+ rated, no anime", kind: "both", expect: "dark + Thriller + minRating + excludeAnime" },
  { prompt: "90-minute action comedies in Spanish or Italian", kind: "collection", expect: "Action + Comedy + runtime + multi-language" },

  // ── Edge / tricky ────────────────────────────────────────────────
  { prompt: "Studio Ghibli type stuff", kind: "both", expect: "ja + Animation (or moods)" },
  { prompt: "not a French film", kind: "both", expect: "excludeOriginalLanguages=[fr]" },
  { prompt: "rewatchable stuff I've already seen", kind: "collection", expect: "seenFilter=seen_only" },
  { prompt: "xyz qwerty blah", kind: "both", expect: "mostly empty" },
];

function summary(f: Record<string, unknown>, fields: string[]) {
  const parts: string[] = [];
  for (const k of fields) {
    const v = f[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v === false) continue;
    if (typeof v === "object") parts.push(`${k}=${JSON.stringify(v)}`);
    else parts.push(`${k}=${v}`);
  }
  return parts.join("  ");
}

async function main() {
  const REC_FIELDS = ["mediaType", "genres", "excludeGenres", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "yearFrom", "yearTo", "minRating", "era", "runtime", "experience"];
  const COL_FIELDS = ["mediaType", "genres", "excludeGenres", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "yearFrom", "yearTo", "minRating", "runtime", "seenFilter", "textQuery"];

  console.log("=".repeat(80));
  console.log("RECOMMEND TOOL");
  console.log("=".repeat(80));
  for (const c of CASES) {
    if (c.kind === "collection") continue;
    const f = await extractRecommendationFilters(c.prompt);
    console.log(`> ${c.prompt}`);
    if (c.expect) console.log(`  (expect: ${c.expect})`);
    console.log(`  ${summary(f as unknown as Record<string, unknown>, REC_FIELDS)}`);
    console.log();
  }

  console.log("=".repeat(80));
  console.log("COLLECTION TOOL");
  console.log("=".repeat(80));
  for (const c of CASES) {
    if (c.kind === "recommend") continue;
    const f = await extractCollectionFilters(c.prompt);
    console.log(`> ${c.prompt}`);
    if (c.expect) console.log(`  (expect: ${c.expect})`);
    console.log(`  ${summary(f as unknown as Record<string, unknown>, COL_FIELDS)}`);
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
