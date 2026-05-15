// Targeted retest: keyword extraction + severity cap tightening.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });
import { extractRecommendationFilters } from "../lib/ai/recommend-filters";
import { extractCollectionFilters } from "../lib/ai/collection-filters";
import { resolveKeywords } from "../lib/tmdb-keywords";

type Kind = "recommend" | "collection" | "both";
interface TestCase { prompt: string; kind?: Kind; expect?: string; }

const CASES: TestCase[] = [
  // ── Keyword: settings / time ─────────────────────────────────────
  { prompt: "TV shows set in the future", kind: "recommend", expect: "keywords=[future]" },
  { prompt: "post-apocalyptic movies", kind: "both", expect: "keywords=[post-apocalyptic]" },
  { prompt: "dystopian sci-fi", kind: "both", expect: "keywords=[dystopia] + Sci-Fi" },
  { prompt: "stuff set in space", kind: "both", expect: "keywords=[space]" },
  { prompt: "WWII war dramas", kind: "both", expect: "keywords=[world war ii] + War/Drama" },

  // ── Keyword: technique ───────────────────────────────────────────
  { prompt: "time loop movies", kind: "both", expect: "keywords=[time loop]" },
  { prompt: "found footage horror", kind: "both", expect: "keywords=[found footage] + Horror" },
  { prompt: "one-shot films", kind: "both", expect: "keywords=[one-shot]" },
  { prompt: "a mockumentary", kind: "both", expect: "keywords=[mockumentary]" },

  // ── Keyword: holidays ────────────────────────────────────────────
  { prompt: "a wholesome Christmas movie", kind: "both", expect: "keywords=[christmas] + feel-good" },
  { prompt: "Halloween horror", kind: "both", expect: "keywords=[halloween] + Horror" },
  { prompt: "cheesy valentine's rom-coms", kind: "both", expect: "keywords=[valentine's day] + Romance+Comedy" },

  // ── Keyword: scenarios ───────────────────────────────────────────
  { prompt: "road trip comedies", kind: "both", expect: "keywords=[road trip] + Comedy" },
  { prompt: "heist thrillers", kind: "both", expect: "keywords=[heist] + Crime/Thriller" },
  { prompt: "courtroom dramas", kind: "both", expect: "keywords=[courtroom] + Drama" },
  { prompt: "prison escape films", kind: "both", expect: "keywords=[prison]" },
  { prompt: "coming-of-age high school stories", kind: "both", expect: "keywords=[high school]" },
  { prompt: "wedding movies", kind: "both", expect: "keywords=[wedding]" },
  { prompt: "first contact sci-fi", kind: "both", expect: "keywords=[first contact]" },
  { prompt: "serial killer thrillers", kind: "both", expect: "keywords=[serial killer] + Thriller" },

  // ── Keyword: shouldn't trigger ──────────────────────────────────
  { prompt: "a good drama", kind: "both", expect: "NO keywords (too vague)" },
  { prompt: "action movies", kind: "both", expect: "NO keywords (genre is enough)" },
  { prompt: "sci-fi in the 90s", kind: "both", expect: "NO keywords (setting covered by era)" },

  // ── Severity caps tightening ─────────────────────────────────────
  { prompt: "no gore", kind: "both", expect: "maxViolence=mild" },
  { prompt: "no blood please", kind: "both", expect: "maxViolence=mild" },
  { prompt: "no horror, no slasher, no gore", kind: "both", expect: "excludeGenres=[Horror] + maxViolence=mild" },
  { prompt: "scary but no jumpscares", kind: "both", expect: "Horror + maxScaryIntense=mild" },
  { prompt: "nothing too scary", kind: "both", expect: "maxScaryIntense=moderate" },
  { prompt: "family-friendly movies", kind: "both", expect: "ALL max caps at mild" },
  { prompt: "no nudity or swearing", kind: "both", expect: "maxSexual=mild + maxLanguage=mild" },
  { prompt: "scary but no gore", kind: "both", expect: "Horror + maxViolence=mild" },

  // ── Combined realistic prompts ───────────────────────────────────
  { prompt: "Christmas rom-coms, nothing too crude", kind: "collection", expect: "christmas + Comedy+Romance + maxLanguage/Sexual" },
  { prompt: "time loop movies rated 7+ in English", kind: "both", expect: "time loop + minRating=7 + en" },
  { prompt: "road trip movies from the 90s", kind: "recommend", expect: "road trip + era=90s" },
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
  const REC_FIELDS = ["mediaType", "genres", "excludeGenres", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "yearFrom", "yearTo", "minRating", "era", "runtime", "experience", "keywords", "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes"];
  const COL_FIELDS = ["mediaType", "genres", "excludeGenres", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "yearFrom", "yearTo", "minRating", "runtime", "seenFilter", "textQuery", "keywords", "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes"];

  console.log("=".repeat(80));
  console.log("RECOMMEND TOOL");
  console.log("=".repeat(80));
  for (const c of CASES) {
    if (c.kind === "collection") continue;
    const f = await extractRecommendationFilters(c.prompt);
    console.log(`> ${c.prompt}`);
    if (c.expect) console.log(`  (expect: ${c.expect})`);
    console.log(`  ${summary(f as unknown as Record<string, unknown>, REC_FIELDS)}`);
    if (f.keywords.length > 0) {
      const ids = await resolveKeywords(f.keywords);
      console.log(`  → TMDB keyword IDs: ${JSON.stringify(ids)}`);
    }
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
    if (f.keywords.length > 0) {
      const ids = await resolveKeywords(f.keywords);
      console.log(`  → TMDB keyword IDs: ${JSON.stringify(ids)}`);
    }
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
