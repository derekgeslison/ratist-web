// Overnight AI stress test — runs a battery of prompts against both the
// recommend and collection extractors and logs every output for later analysis.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

interface PromptCase {
  id: number;
  category: string;
  prompt: string;
  kind: "both" | "recommend" | "collection";
  expect?: string;
}

const RAW_PROMPTS: Array<Omit<PromptCase, "id">> = [
  // ── 1. SHORT / MINIMAL ─────────────────────────────────────────────
  { category: "short",     prompt: "sci-fi",                 kind: "both", expect: "SciFi genre" },
  { category: "short",     prompt: "movies",                 kind: "both", expect: "mediaType=movie, otherwise empty" },
  { category: "short",     prompt: "good shit",              kind: "both", expect: "probably minRating=7.5 or empty" },
  { category: "short",     prompt: "something fun",          kind: "both", expect: "mood=funny/feel-good" },
  { category: "short",     prompt: "a comedy",               kind: "both", expect: "genre=Comedy, mediaType=any" },
  { category: "short",     prompt: "horror",                 kind: "both", expect: "genre=Horror (movies)" },

  // ── 2. CASUAL CONVERSATIONAL ───────────────────────────────────────
  { category: "casual",    prompt: "what should i watch tonight after a long day",              kind: "both", expect: "mood=feel-good or funny" },
  { category: "casual",    prompt: "I'm bored and want something mindless",                     kind: "both", expect: "mood=funny maybe Action, light" },
  { category: "casual",    prompt: "show me something my girlfriend would like",                kind: "both", expect: "mood=romantic or Romance/Comedy" },
  { category: "casual",    prompt: "comfort TV for being sick",                                 kind: "both", expect: "mediaType=tv, mood=feel-good" },
  { category: "casual",    prompt: "something to put on in the background while I cook",        kind: "both", expect: "light/casual, maybe feel-good" },
  { category: "casual",    prompt: "movie for tonight after a shitty week at work",             kind: "both", expect: "feel-good or funny" },
  { category: "casual",    prompt: "i need a good cry",                                         kind: "both", expect: "tearjerker mood" },
  { category: "casual",    prompt: "i want to laugh",                                           kind: "both", expect: "funny + Comedy" },

  // ── 3. VERY SPECIFIC COMPOUND ──────────────────────────────────────
  { category: "compound",  prompt: "Korean psychological thrillers from the 2010s, rated 8+, no gore", kind: "both", expect: "ko + 2010s + minRating=8 + maxViolence=mild + Thriller" },
  { category: "compound",  prompt: "1970s Italian giallo films under 2 hours",                 kind: "both", expect: "yr=1970-79 + it + maybe keyword=giallo + runtime=short/feature" },
  { category: "compound",  prompt: "animated features from Studio Ghibli or Pixar",            kind: "both", expect: "Animation + movie; Ghibli/Pixar no schema" },
  { category: "compound",  prompt: "slow-burn sci-fi like Annihilation or Arrival from the past decade", kind: "both", expect: "SciFi + yearFrom=2016 + maybe thought-provoking" },
  { category: "compound",  prompt: "a feel-good animated movie from the 90s, under 90 minutes", kind: "both", expect: "Animation + 90s + short + feel-good" },

  // ── 4. CAST / DIRECTOR / FRANCHISE (NO SCHEMA SUPPORT) ─────────────
  { category: "franchise", prompt: "Tom Hanks movies",             kind: "both", expect: "no schema for cast — see what happens" },
  { category: "franchise", prompt: "anything by Tarantino",        kind: "both", expect: "no schema for director" },
  { category: "franchise", prompt: "Christopher Nolan films",      kind: "both", expect: "no schema — maybe mind-bending mood" },
  { category: "franchise", prompt: "Marvel movies",                kind: "both", expect: "no schema — maybe Action+Adventure" },
  { category: "franchise", prompt: "Star Wars",                    kind: "both", expect: "no schema" },
  { category: "franchise", prompt: "James Bond",                   kind: "both", expect: "no schema — maybe Action" },
  { category: "franchise", prompt: "Pixar movies",                 kind: "both", expect: "Animation + Family" },
  { category: "franchise", prompt: "Studio Ghibli",                kind: "both", expect: "Animation + ja" },
  { category: "franchise", prompt: "Wes Anderson type stuff",      kind: "both", expect: "mood=offbeat" },

  // ── 5. AWARDS / PRESTIGE ───────────────────────────────────────────
  { category: "awards",    prompt: "Oscar winners",                 kind: "both", expect: "no schema — maybe minRating high" },
  { category: "awards",    prompt: "Cannes winners",                kind: "both", expect: "no schema" },
  { category: "awards",    prompt: "Best Picture winners",          kind: "both", expect: "no schema" },
  { category: "awards",    prompt: "Criterion Collection stuff",    kind: "both", expect: "no schema — offbeat/classic?" },

  // ── 6. PLATFORM-SPECIFIC ───────────────────────────────────────────
  { category: "platform",  prompt: "what's on Netflix",             kind: "recommend", expect: "providers=[Netflix]" },
  { category: "platform",  prompt: "only on Prime",                 kind: "recommend", expect: "providers=[Prime]" },
  { category: "platform",  prompt: "HBO shows",                     kind: "recommend", expect: "mediaType=tv + providers=[Max]" },
  { category: "platform",  prompt: "Disney+ kids stuff",            kind: "recommend", expect: "providers=[Disney+] + Family" },
  { category: "platform",  prompt: "Apple TV+ originals",           kind: "recommend", expect: "providers=[Apple TV+]" },

  // ── 7. CONTRADICTORY / TRICKY ─────────────────────────────────────
  { category: "tricky",    prompt: "scary but feel-good",           kind: "both", expect: "contradictory — what does AI do?" },
  { category: "tricky",    prompt: "violent but clean",             kind: "both", expect: "contradictory" },
  { category: "tricky",    prompt: "long but not too long",         kind: "both", expect: "probably runtime=long or feature" },
  { category: "tricky",    prompt: "artsy but entertaining",        kind: "both", expect: "offbeat + funny?" },
  { category: "tricky",    prompt: "scary but not too scary",       kind: "both", expect: "Horror + maxScaryIntense=moderate" },

  // ── 8. RELATIVE YEAR / TIME ────────────────────────────────────────
  { category: "year",      prompt: "from this year",                kind: "both", expect: "yearFrom=2026 yearTo=2026" },
  { category: "year",      prompt: "last 5 years",                  kind: "both", expect: "yearFrom=2021, yearTo=null" },
  { category: "year",      prompt: "past decade",                   kind: "both", expect: "yearFrom=2016, yearTo=null" },
  { category: "year",      prompt: "pre-2000s",                     kind: "both", expect: "yearTo=1999" },
  { category: "year",      prompt: "mid-90s to early 2000s",        kind: "both", expect: "yearFrom ~1995 yearTo ~2003" },
  { category: "year",      prompt: "anything not from the last 20 years", kind: "both", expect: "yearTo ~2006" },
  { category: "year",      prompt: "released in 2022",              kind: "both", expect: "yearFrom=2022 yearTo=2022" },
  { category: "year",      prompt: "from the 80s",                  kind: "recommend", expect: "era=80s" },
  { category: "year",      prompt: "before 1980",                   kind: "both", expect: "yearTo=1979" },

  // ── 9. RUNTIME SPECIFICS ───────────────────────────────────────────
  { category: "runtime",   prompt: "90-minute movies",              kind: "both", expect: "runtime=[short, feature]" },
  { category: "runtime",   prompt: "under 2 hours",                 kind: "both", expect: "runtime=[short, feature]" },
  { category: "runtime",   prompt: "3-hour epics",                  kind: "both", expect: "runtime=[epic]" },
  { category: "runtime",   prompt: "movies I can finish during a nap", kind: "both", expect: "runtime=[short]" },
  { category: "runtime",   prompt: "binge-able TV",                 kind: "both", expect: "mediaType=tv" },

  // ── 10. QUALITY THRESHOLDS ─────────────────────────────────────────
  { category: "quality",   prompt: "highly rated",                  kind: "both", expect: "minRating=7.5" },
  { category: "quality",   prompt: "must be 8+",                    kind: "both", expect: "minRating=8" },
  { category: "quality",   prompt: "great movies only",             kind: "both", expect: "minRating=7.5" },
  { category: "quality",   prompt: "not garbage",                   kind: "both", expect: "maybe minRating=7" },
  { category: "quality",   prompt: "critically acclaimed",          kind: "both", expect: "minRating=7.5" },
  { category: "quality",   prompt: "hidden gems",                   kind: "recommend", expect: "experience=[hidden_gem]" },

  // ── 11. LANGUAGE / ORIGIN EDGE CASES ───────────────────────────────
  { category: "language",  prompt: "dubbed anime",                  kind: "both", expect: "ja + Animation" },
  { category: "language",  prompt: "English subtitles required",    kind: "both", expect: "no clear mapping — should maybe stay empty" },
  { category: "language",  prompt: "no English",                    kind: "both", expect: "excludeOriginalLanguages=[en]" },
  { category: "language",  prompt: "any language",                  kind: "both", expect: "all empty" },
  { category: "language",  prompt: "Korean or Thai",                kind: "both", expect: "originalLanguage=[ko, th]" },
  { category: "language",  prompt: "Latin American cinema",         kind: "both", expect: "originalLanguage=[es, pt]" },
  { category: "language",  prompt: "only American",                 kind: "both", expect: "originalLanguage=[en]" },

  // ── 12. CONTENT RATING SPECIFICS ───────────────────────────────────
  { category: "rating",    prompt: "R-rated only",                  kind: "both", expect: "mpaa=[R]" },
  { category: "rating",    prompt: "nothing above PG-13",           kind: "both", expect: "mpaa=[G,PG,PG-13]" },
  { category: "rating",    prompt: "TV-14 max",                     kind: "both", expect: "mpaa=[TV-Y, TV-Y7, TV-G, TV-PG, TV-14]" },
  { category: "rating",    prompt: "mature content OK",             kind: "both", expect: "probably empty" },
  { category: "rating",    prompt: "squeaky clean",                 kind: "both", expect: "all max caps=mild" },

  // ── 13. PARENTS-GUIDE / SEVERITY ───────────────────────────────────
  { category: "severity",  prompt: "extreme violence",              kind: "both", expect: "minViolence=moderate-severe" },
  { category: "severity",  prompt: "steamy",                        kind: "both", expect: "minSexualContent=moderate" },
  { category: "severity",  prompt: "nothing triggering",            kind: "both", expect: "maxSensitiveThemes=moderate" },
  { category: "severity",  prompt: "no animal deaths",              kind: "both", expect: "maxSensitiveThemes=moderate" },
  { category: "severity",  prompt: "safe for my 10-year-old",       kind: "both", expect: "ALL max caps=mild" },
  { category: "severity",  prompt: "no jumpscares",                 kind: "both", expect: "maxScaryIntense=mild" },
  { category: "severity",  prompt: "bloody horror",                 kind: "both", expect: "Horror + minViolence=moderate-severe" },
  { category: "severity",  prompt: "slow burn no gore",             kind: "both", expect: "maxViolence=mild + mood?" },

  // ── 14. NICHE THEMES (KEYWORDS) ────────────────────────────────────
  { category: "keywords",  prompt: "time loop movies",              kind: "both", expect: "keywords=[time loop]" },
  { category: "keywords",  prompt: "post-apocalyptic",              kind: "both", expect: "keywords=[post-apocalyptic]" },
  { category: "keywords",  prompt: "found footage",                 kind: "both", expect: "keywords=[found footage]" },
  { category: "keywords",  prompt: "mockumentary",                  kind: "both", expect: "keywords=[mockumentary]" },
  { category: "keywords",  prompt: "one-shot",                      kind: "both", expect: "keywords=[one-shot]" },
  { category: "keywords",  prompt: "heist",                         kind: "both", expect: "keywords=[heist] + Crime" },
  { category: "keywords",  prompt: "christmas",                     kind: "both", expect: "keywords=[christmas]" },
  { category: "keywords",  prompt: "road trip",                     kind: "both", expect: "keywords=[road trip]" },
  { category: "keywords",  prompt: "wedding",                       kind: "both", expect: "keywords=[wedding]" },
  { category: "keywords",  prompt: "serial killer",                 kind: "both", expect: "keywords=[serial killer]" },
  { category: "keywords",  prompt: "courtroom",                     kind: "both", expect: "keywords=[courtroom]" },
  { category: "keywords",  prompt: "zombies",                       kind: "both", expect: "Horror + maybe keywords=[zombie]" },
  { category: "keywords",  prompt: "vampires",                      kind: "both", expect: "Horror/Fantasy + maybe keywords=[vampire]" },

  // ── 15. TV MOOD (no Romance/Horror genres) ─────────────────────────
  { category: "tvmood",    prompt: "a scary TV show",               kind: "both", expect: "mediaType=tv + mood=[scary]" },
  { category: "tvmood",    prompt: "romantic TV",                   kind: "both", expect: "mediaType=tv + mood=[romantic]" },
  { category: "tvmood",    prompt: "dark TV drama",                 kind: "both", expect: "mediaType=tv + Drama + mood=[dark]" },

  // ── 16. SEEN / UNSEEN (COLLECTIONS) ────────────────────────────────
  { category: "seen",      prompt: "stuff I've already seen",       kind: "collection", expect: "seenFilter=seen_only" },
  { category: "seen",      prompt: "new to me",                     kind: "collection", expect: "seenFilter=unseen" },
  { category: "seen",      prompt: "rewatchable favorites",         kind: "collection", expect: "seenFilter=seen_only" },
  { category: "seen",      prompt: "what I haven't watched yet",    kind: "collection", expect: "seenFilter=unseen" },
  { category: "seen",      prompt: "best of what I've seen",        kind: "collection", expect: "seenFilter=seen_only" },

  // ── 17. COMPOUND NICHE ─────────────────────────────────────────────
  { category: "niche",     prompt: "A24 vibes",                     kind: "both", expect: "offbeat mood" },
  { category: "niche",     prompt: "Blumhouse horror",              kind: "both", expect: "Horror" },
  { category: "niche",     prompt: "Marvel Cinematic Universe",     kind: "both", expect: "Action/Adventure" },

  // ── 18. TYPOS / GRAMMAR ────────────────────────────────────────────
  { category: "typos",     prompt: "Korean horrer",                 kind: "both", expect: "ko + Horror" },
  { category: "typos",     prompt: "movies frum the 90s",           kind: "both", expect: "movie + era=90s" },
  { category: "typos",     prompt: "sci fi",                        kind: "both", expect: "Science Fiction" },
  { category: "typos",     prompt: "80's films",                    kind: "both", expect: "era=80s" },
  { category: "typos",     prompt: "SCARY MOVIES PLEASE",           kind: "both", expect: "Horror" },

  // ── 19. SEASONAL / MOOD ────────────────────────────────────────────
  { category: "seasonal",  prompt: "cozy fall movies",              kind: "both", expect: "feel-good mood" },
  { category: "seasonal",  prompt: "summer blockbusters",           kind: "both", expect: "Action/Adventure, popular" },
  { category: "seasonal",  prompt: "date night",                    kind: "both", expect: "romantic mood" },
  { category: "seasonal",  prompt: "after a breakup",               kind: "both", expect: "tearjerker or feel-good" },
  { category: "seasonal",  prompt: "Halloween night",               kind: "both", expect: "Horror + keywords=[halloween]" },

  // ── 20. EXTREME / GIBBERISH ────────────────────────────────────────
  { category: "gibberish", prompt: "aaaa",                          kind: "both", expect: "empty filters" },
  { category: "gibberish", prompt: "help",                          kind: "both", expect: "empty filters" },
  { category: "gibberish", prompt: "..........",                    kind: "both", expect: "empty filters" },
  { category: "gibberish", prompt: "I dunno",                       kind: "both", expect: "empty filters" },
  { category: "gibberish", prompt: "surprise me",                   kind: "both", expect: "empty filters, maybe experience=[popular]" },
];

const CASES: PromptCase[] = RAW_PROMPTS.map((p, i) => ({ id: i + 1, ...p }));

// Display only the non-empty fields
function summarize(f: Record<string, unknown>, fields: string[]): string {
  const parts: string[] = [];
  for (const k of fields) {
    const v = f[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v === false) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (typeof v === "object") parts.push(`${k}=${JSON.stringify(v)}`);
    else parts.push(`${k}=${v}`);
  }
  return parts.length > 0 ? parts.join("  ") : "(no filters extracted)";
}

async function main() {
  const { extractRecommendationFilters } = await import("../lib/ai/recommend-filters");
  const { extractCollectionFilters } = await import("../lib/ai/collection-filters");

  const REC_FIELDS = [
    "mediaType", "genres", "excludeGenres", "moods", "experience", "providers",
    "originalLanguage", "excludeOriginalLanguages", "excludeAnime",
    "yearFrom", "yearTo", "era", "runtime", "minRating", "mpaaRatings", "keywords",
    "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes",
    "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes",
  ];
  const COL_FIELDS = [
    "mediaType", "genres", "excludeGenres", "moods",
    "originalLanguage", "excludeOriginalLanguages", "excludeAnime",
    "yearFrom", "yearTo", "runtime", "minRating", "textQuery", "keywords", "seenFilter",
    "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes",
    "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes",
    "suggestedName",
  ];

  const startTime = Date.now();
  const totalPrompts = CASES.length;
  console.log(`Running ${totalPrompts} prompts through BOTH extractors`);
  console.log(`Today's year (for relative dates) = ${new Date().getFullYear()}`);
  console.log("=".repeat(100));

  let lastCategory = "";
  for (const c of CASES) {
    if (c.category !== lastCategory) {
      console.log();
      console.log(`### CATEGORY: ${c.category.toUpperCase()}`);
      console.log();
      lastCategory = c.category;
    }
    const needRec = c.kind === "both" || c.kind === "recommend";
    const needCol = c.kind === "both" || c.kind === "collection";

    console.log(`[${c.id}] "${c.prompt}"`);
    if (c.expect) console.log(`    expect: ${c.expect}`);

    if (needRec) {
      try {
        const f = await extractRecommendationFilters(c.prompt);
        console.log(`    REC: ${summarize(f as unknown as Record<string, unknown>, REC_FIELDS)}`);
      } catch (e) {
        console.log(`    REC: ERROR ${(e as Error).message}`);
      }
    }
    if (needCol) {
      try {
        const f = await extractCollectionFilters(c.prompt);
        console.log(`    COL: ${summarize(f as unknown as Record<string, unknown>, COL_FIELDS)}`);
      } catch (e) {
        console.log(`    COL: ERROR ${(e as Error).message}`);
      }
    }
    console.log();
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDONE — ${elapsed}s elapsed, ${totalPrompts} prompts tested.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
