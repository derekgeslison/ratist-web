import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";
import { STUDIOS } from "../studios";
import { detectGenresFromPrompt, isVibeDescriptor, stripVibeKeywords } from "./genre-detection";

const STUDIO_NAMES = STUDIOS.map((s) => s.name);

// TMDB genre names — exactly as TMDB returns them, used to map to genre IDs downstream
export const TMDB_MOVIE_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller",
  "War", "Western",
] as const;

// Severity levels in ascending order. "max" filters accept titles whose cached
// severity is <= the cap. null means no cap.
export const SEVERITY_ORDER = ["none", "mild", "mild-moderate", "moderate", "moderate-severe", "severe"] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

// Hidden mood tags — same vocabulary as recommend. The route expands these
// into additional genre adds/excludes before fetching.
export const MOODS = [
  "feel-good", "dark", "scary", "romantic", "tearjerker",
  "mind-bending", "thought-provoking", "epic", "inspiring", "offbeat",
  "funny", "edge-of-seat",
] as const;
export type Mood = (typeof MOODS)[number];

export interface CollectionFilters {
  mediaType: "movie" | "tv" | "any";
  genres: string[];
  excludeGenres: string[];
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number | null;
  textQuery: string | null;
  seenFilter: "any" | "unseen" | "seen_only";
  // TMDB 2-letter language codes. originalLanguage is an INCLUDE whitelist;
  // excludeOriginalLanguages is a BLACKLIST.
  originalLanguage: string[];
  excludeOriginalLanguages: string[];
  // Compound filter — "no anime" = Japanese-origin Animation only. Server
  // post-filters instead of excluding the whole Animation genre.
  excludeAnime: boolean;
  // Runtime buckets for movies only: "short" <90, "feature" 90-120,
  // "long" 120-150, "epic" >150.
  runtime: string[];
  // 1–3 natural-language phrases resolved server-side to TMDB keyword tags.
  // Covers niche themes (future, time loop, christmas, heist, etc.) that
  // genres and moods miss. Falls back to no-keyword results if sparse.
  keywords: string[];
  // Same vocabulary as `keywords` but applied as TMDB without_keywords —
  // themes the user wants to AVOID ("no time travel", "no zombies").
  excludeKeywords: string[];
  // Production company / studio names from the curated whitelist (lib/studios.ts).
  // Resolved to TMDB company IDs and applied via with_companies. Studios are
  // a separate dimension from keywords — using "A24" as a keyword returns 0
  // results because TMDB treats it as a company, not a tag.
  studios: string[];
  maxViolence: Severity | null;
  maxSexualContent: Severity | null;
  maxLanguageSubstance: Severity | null;
  maxScaryIntense: Severity | null;
  maxSensitiveThemes: Severity | null;
  minViolence: Severity | null;
  minSexualContent: Severity | null;
  minLanguageSubstance: Severity | null;
  minScaryIntense: Severity | null;
  minSensitiveThemes: Severity | null;
  moods: Mood[];
  limit: number;
  suggestedName: string;
  // MPAA movie ratings (G/PG/PG-13/R/NC-17) + US TV ratings (TV-Y..TV-MA) the
  // user explicitly named. Kept separate from severity caps — ratings are a
  // hard certification filter (collections applies via TMDB discover), while
  // severity caps are our own parents-guide post-filter.
  mpaaRatings: string[];
  // Actor names extracted from "Tom Hanks movies" / "with X" / "by Y".
  // Resolved to TMDB person IDs. Directors aren't natively filterable by
  // TMDB discover but the AI still extracts their names for consistency.
  cast: string[];
}

const MPAA_RATINGS = ["G", "PG", "PG-13", "R", "NC-17"] as const;
const TV_RATINGS = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"] as const;
const ALL_CERTS = [...MPAA_RATINGS, ...TV_RATINGS] as const;

function buildSystemPrompt(currentYear: number): string {
  return `You extract structured filters for building a movie/TV collection from a user's natural-language prompt.

You do NOT name specific movies or shows. You only extract filter values. The site's recommendation engine will run the actual search against a real catalog.

### Negative constraints
When the user says "not X", "nothing too X", "avoid X", "but not X", "without X":
- If X is a genre → put it in excludeGenres (NOT in genres), even if the overall topic is adjacent. Example: "Halloween movies for kids, nothing too scary" → genres: [Family, Fantasy], excludeGenres: [Horror].

### Genre mapping
**If the prompt names a canonical TMDB genre directly, ALWAYS include it in \`genres\`.** This is the most common case and is non-negotiable. Examples:
- "war movies" / "war films" → genres: ["War"]
- "horror movies" / "horror films" → genres: ["Horror"]
- "comedies" / "comedy films" → genres: ["Comedy"]
- "westerns" → genres: ["Western"]
- "thrillers" → genres: ["Thriller"]
- "documentaries" → genres: ["Documentary"]
- "mysteries" → genres: ["Mystery"]
- "musicals" → genres: ["Music"]
- "fantasy films" → genres: ["Fantasy"]
- "dramas" → genres: ["Drama"]
- "animated films" / "animation" → genres: ["Animation"]

The 19 canonical TMDB genres are: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, TV Movie, Thriller, War, Western. If any of these (or their obvious plural/phrasing variants) appears in the prompt, it goes in \`genres\`. Don't put it in textQuery, don't put it in keywords — \`genres\` is the right field.

Map synonyms to canonical genres: "sci-fi"/"cyberpunk"/"space" → "Science Fiction"; "rom-com" → "Comedy" + "Romance"; "superhero" → "Action" + "Adventure"; "slasher"/"gore" → "Horror".

If a sub-genre IS well-represented by a canonical genre, use that genre ALONE — do NOT also add it to textQuery (textQuery combines with genre as AND and will over-narrow):
- "gangster"/"mob" → "Crime" + "Drama" (no textQuery)
- "heist" → "Crime" (no textQuery)
- "noir"/"film noir" → "Crime" + "Thriller" (no textQuery)
- "detective"/"whodunit" → "Mystery" + "Crime" (no textQuery)
- "zombie" → "Horror" (no textQuery)
- "superhero" → "Action" + "Adventure" (no textQuery)
- "kung fu"/"martial arts" → "Action" (no textQuery)
- "biopic" → "Drama" + "History" (no textQuery)
- "epic fantasy"/"sword & sorcery" → "Fantasy" + "Adventure" (no textQuery)

ONLY use textQuery for truly niche concepts that are NOT captured by any main genre: "giallo", "mockumentary", "cyberpunk" (still primarily Sci-Fi, but has enough distinct feel that textQuery can help), very specific themes like "time loop", "found footage". Keep textQuery short (1-2 words).

**NEVER put vibe descriptors in textQuery, keywords, or genres.** Words like "cult", "cult classic", "underrated", "iconic", "groundbreaking", "essential", "classic" (alone), "best", "greatest", "must-see", "hidden gem", "obscure" are reputation/popularity adjectives, not filterable attributes — TMDB doesn't tag films this way. They give over-narrow results (e.g. textQuery="cult" returns ~1 film). Map them as follows:
- "cult [classic]" / "cult films" / "weird" / "offbeat" / "indie" / "arthouse" / "quirky" → moods: ["offbeat"]
- "underrated" / "hidden gem" / "obscure" → leave all of these out; the user just wants well-curated results, not a magic filter.
- "iconic" / "classic" (alone) / "essential" / "must-see" / "groundbreaking" → leave out; these are quality assertions, not filters.
- "best" / "greatest" / "top" → leave out; the default sort is already top-rated.

So "cult classic comedies" → genres: ["Comedy"], moods: ["offbeat"]. NOT textQuery: "cult", NOT keywords: ["cult"], NOT yearTo: anything.

### Year mapping
Today's year is ${currentYear}. Use this for relative time phrases.
- "70s" → yearFrom: 1970, yearTo: 1979. Same pattern for 80s/90s/2000s/2010s.
- "recent"/"new"/"modern" → yearFrom: 2020.
- "golden age"/"Hollywood classic era" → yearTo: 1960.
- "classic" ALONE (e.g. "classic gangster movies", "classic comedies") usually means canonical / iconic, NOT a specific era. LEAVE yearFrom and yearTo null in this case — don't force a year filter.
- "in the last N years" / "past N years" / "the last decade" → yearFrom: ${currentYear} - N (or 10 for "decade"), yearTo: null. **Never set yearTo for open-ended relative phrases** — the user means "up to now", which is the default.
- "released this year" / "from this year" → yearFrom: ${currentYear}, yearTo: ${currentYear}
- "before X" → yearTo: X-1 (no yearFrom)
- "after X" → yearFrom: X (no yearTo)

### Parents-guide severity caps
Five categories can be capped at a max (ceiling) or min (floor) severity level: none < mild < mild-moderate < moderate < moderate-severe < severe.

**Max caps** filter OUT titles whose cached severity is HIGHER than the cap. ALWAYS set these when the phrasing matches, even in compound prompts ("no horror, no gore" → both excludeGenres Horror AND maxViolence:"mild"). Don't assume genre excludes alone cover it.
- "not too graphic" / "not too violent" → maxViolence: "moderate"
- "no gore" / "no blood" → maxViolence: "mild"
- "no sex" / "no nudity" → maxSexualContent: "mild"
- "clean" / "no swearing" / "no drugs" → maxLanguageSubstance: "mild"
- "nothing scary" / "not too intense" / "nothing too dark" → maxScaryIntense: "mild" AND maxSensitiveThemes: "moderate"
- "no jumpscares" / "not jumpy" → maxScaryIntense: "mild"
- "not too scary" → maxScaryIntense: "moderate"
- "no animal deaths" / "no suicide" → maxSensitiveThemes: "moderate"
- "family-friendly" / "kid-safe" / "for kids" / "for my 10-year-old" → ALL five max caps at "mild"
- "not too heavy" / "something light" → maxViolence + maxSensitiveThemes at "moderate"
- "Halloween, not too scary" → maxScaryIntense: "moderate", maxViolence: "moderate"

**Min caps** filter OUT titles whose cached severity is LOWER than the cap. Used when the user wants a LOT of something.
- "very violent" / "brutal" / "ultra-violent" / "gore porn" / "Saw-level" / "bloodbath" → minViolence: "moderate-severe"
- "some action and violence" → minViolence: "moderate"
- "sexy" / "steamy" / "erotic" / "lots of nudity" / "NC-17" → minSexualContent: "moderate"
- "hardcore sex" / "explicit nudity" → minSexualContent: "moderate-severe"
- "really scary" / "terrifying" / "intense horror" / "peak horror" → minScaryIntense: "moderate-severe"
- "jump-scare heavy" → minScaryIntense: "moderate"
- "lots of drugs" / "stoner flicks" / "heavy drug use" → minLanguageSubstance: "moderate"
- "dark and disturbing" / "heavy themes" / "bleak" → minSensitiveThemes: "moderate"

Don't kink-shame or moralize — extract what the user asked for. Set both a min and max only if the user explicitly wants a range (e.g. "violent but not gory"). Leave caps null when the user doesn't mention them.

Data coverage for these caps is partial — uncached titles pass through MAX caps (include by default) but are EXCLUDED from MIN caps (can't confirm they meet the floor).

### Moods (hidden tags — use liberally)
moods is a multi-select array that shapes results beyond what genres can capture. The server expands each mood into extra genres to include + genres to avoid. Pick 0-3 moods based on the tone the user describes:
- "feel-good": uplifting, cozy, heartwarming
- "dark": gritty, bleak, noir, grim, psychological
- "scary": horror / terror / frightening (also for TV where Horror genre doesn't exist)
- "romantic": love-driven, emotional (CRITICAL for TV where Romance genre doesn't exist)
- "tearjerker": "makes me cry", bittersweet, heart-wrenching
- "mind-bending": twisty, nonlinear, reality-bending
- "thought-provoking": cerebral, reflective, philosophical
- "epic": grand-scale, sweeping
- "inspiring": motivational, underdog, triumphant
- "offbeat": weird, indie, arthouse, quirky
- "funny": comedic, laugh-out-loud
- "edge-of-seat": suspenseful, nail-biting

ALWAYS set moods when the user describes tone — they compensate for thin genre coverage. "a dark TV show" → moods: ["dark"]. "a romantic TV show" → moods: ["romantic"] (TV lacks Romance genre). "a scary show" → moods: ["scary"] (TV lacks Horror genre).

### Language / origin
Use TMDB 2-letter ISO codes. originalLanguage is an INCLUDE whitelist; excludeOriginalLanguages is a BLACKLIST. Common codes: en, ja, ko, zh, hi, es, fr, de, it, pt, ru, tr, ar, th, sv, da, no, nl, pl.

- "Korean thriller" / "K-drama" → originalLanguage: ["ko"] (K-drama implies mediaType: "tv")
- "Bollywood" / "Hindi film" → originalLanguage: ["hi"]
- "Japanese horror" → originalLanguage: ["ja"]
- "foreign films" / "subtitled" / "international" → excludeOriginalLanguages: ["en"]
- "no foreign films" / "English only" → originalLanguage: ["en"]
- "anime" (wanting) → originalLanguage: ["ja"] + genres: ["Animation"]

### Compound: anime exclusion
"no anime" / "not anime" / "I hate anime" → set excludeAnime: true. Do NOT set excludeGenres: ["Animation"] for these prompts — that would also exclude Pixar/DreamWorks/etc. Leave excludeAnime false otherwise.

### Runtime (movies only)
runtime is an array. Leave empty unless the user mentions duration.
- "short" (<90 min) — "quick watch", "under 90 minutes"
- "feature" (90-120) — "standard length"
- "long" (120-150) — "long movie"
- "epic" (>150 min) — "marathon", "epic-length", "3-hour"

### Keywords (niche themes)
keywords is an array of 1–3 short natural-language phrases resolved server-side to TMDB keyword tags. The server falls back to no-keyword results if the query yields too few titles, so err on the side of including a keyword when the user names a specific theme. Use when the prompt mentions:
- setting/time: "set in the future" → "future"; "post-apocalyptic" → "post-apocalyptic"; "dystopia" → "dystopia"; "set in space" → "space"; "WWII" → "world war ii"
- technique: "time loop" → "time loop"; "found footage" → "found footage"; "one-shot" → "one-shot"; "mockumentary" → "mockumentary"; "nonlinear" → "nonlinear timeline"
- holidays: "christmas" → "christmas"; "halloween" → "halloween"; "thanksgiving" → "thanksgiving"; "valentine's" → "valentine's day"
- scenarios: "road trip" → "road trip"; "heist" → "heist" (with Crime genre); "courtroom" → "courtroom"; "prison" → "prison"; "high school" → "high school"; "wedding" → "wedding"; "first contact" → "first contact"; "serial killer" → "serial killer"

Do NOT pad keywords. Genres/moods cover most prompts. Prefer single-word phrases. textQuery is a separate mechanism for true sub-genre labels — don't duplicate content across keywords and textQuery.

### Exclude keywords (negative themes)
excludeKeywords mirrors keywords but for themes to AVOID. Same vocabulary. Resolved to TMDB without_keywords. Use when the prompt says "no X" / "without X" / "nothing with X" and X is a niche theme:
- "no time travel" → excludeKeywords: ["time travel"]
- "nothing set in the future" / "no future stuff" → excludeKeywords: ["future"]
- "no zombies" → excludeKeywords: ["zombie"]
- "no christmas movies" → excludeKeywords: ["christmas"]
- "no found-footage" → excludeKeywords: ["found footage"]
- "no superhero stuff" → excludeKeywords: ["superhero"]

If X is a whole genre (Horror, Comedy, etc.) → use excludeGenres instead. Cap at 3, prefer 1-2.

### Studios (production companies)
studios is an array of production company names the user named. Filtered via TMDB with_companies. A SEPARATE dimension from keywords — adding "A24" or "Studio Ghibli" to keywords returns 0 results.

ONLY pick names from this exact whitelist (case-sensitive):
${STUDIO_NAMES.map((n) => `"${n}"`).join(", ")}

Examples:
- "A24 movies" → studios: ["A24"]
- "Studio Ghibli films" / "Ghibli" → studios: ["Studio Ghibli"]
- "Shudder horror" → studios: ["Shudder"]
- "Marvel" / "MCU" → studios: ["Marvel Studios"]
- "Pixar" → studios: ["Pixar"]
- "Disney movie" (the studio) → studios: ["Walt Disney Pictures"]
- "Blumhouse" → studios: ["Blumhouse Productions"]

Don't set studios for style comparisons ("A24-style" → use moods instead) or names not in the whitelist. Don't double-add the studio name to keywords or textQuery.

### Cast / people
cast is an array of up to 3 actor/director full names extracted from the prompt.
- "Tom Hanks movies" → cast: ["Tom Hanks"]
- "a Tarantino movie" → cast: ["Quentin Tarantino"]
- "with Emma Stone" → cast: ["Emma Stone"]
- "Wes Anderson-style" / "A24 vibes" / "like Nolan" → LEAVE cast empty (style comparison, not a person request)
- "Marvel" / "James Bond" / "Star Wars" → LEAVE cast empty (franchise, not a person)

### Other
- "highly rated" / "well-rated" / "only good stuff" / "critically acclaimed" / "great movies only" → minRating: 7.5
- "rated above X" / "higher than X" / "over X stars" / "X+" → minRating: X (0-10 scale, community vote average).
- seenFilter has three values:
  - "unseen" — user wants titles they HAVEN'T seen ("haven't seen", "new to me", "unseen", "I might have missed"). This is the DEFAULT.
  - "seen_only" — user wants titles they HAVE seen ("already seen", "rewatch", "rewatchable", "movies I've watched", "from my list", "best of what I've seen").
  - "any" — user explicitly wants the full catalog regardless of seen status.
- Don't over-stuff genres — pick the 1-3 most clearly implied.
- Limit defaults to 10, cap at 25.
- suggestedName: a short, friendly title for the collection (e.g. "Classic Gangster Movies", "Rewatchable Sci-Fi Favorites").

### Content ratings (MPAA + TV)
mpaaRatings is an array combining movie (${MPAA_RATINGS.join(", ")}) and TV (${TV_RATINGS.join(", ")}) certifications. Set only when the user explicitly names a rating.
- "R-rated" → ["R"]
- "PG-13 or lower" / "nothing above PG-13" / "PG-13 max" / "up to PG-13" → ["G", "PG", "PG-13"]
- "NC-17" → ["NC-17"]
- "TV-MA" → ["TV-MA"]
- "TV-14 max" / "TV-14 and below" → ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14"]
- "family-friendly" → leave empty; severity caps handle this

Rule: "X max" / "up to X" / "and below" / "or lower" / "nothing above X" expands to X plus every rating less restrictive. Never leave just ["PG-13"] for "PG-13 or lower" — always include the lower rungs.

Be conservative. Leave fields null/empty if not clearly implied.`;
}

// Cache the built prompt per-year so the Anthropic cache_control breakpoint
// keeps hitting. The prompt changes once per year.
let cachedSystemPrompt: { year: number; text: string } | null = null;
function getSystemPrompt(): string {
  const year = new Date().getFullYear();
  if (cachedSystemPrompt && cachedSystemPrompt.year === year) return cachedSystemPrompt.text;
  cachedSystemPrompt = { year, text: buildSystemPrompt(year) };
  return cachedSystemPrompt.text;
}

const EXTRACT_COLLECTION_TOOL: Anthropic.Tool = {
  name: "set_collection_filters",
  description: "Set the filters that will be used to build the custom collection. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      mediaType: { type: "string", enum: ["movie", "tv", "any"], description: "Default 'movie' unless TV explicitly asked for." },
      genres: {
        type: "array",
        items: { type: "string", enum: [...TMDB_MOVIE_GENRES] },
        description: "Main genre(s) to include. 1-3 values. Empty if unspecified.",
      },
      excludeGenres: {
        type: "array",
        items: { type: "string", enum: [...TMDB_MOVIE_GENRES] },
        description: "Genres to exclude (user explicitly asked to avoid).",
      },
      yearFrom: { type: ["integer", "null"], description: "Earliest release year." },
      yearTo: { type: ["integer", "null"], description: "Latest release year." },
      minRating: { type: ["number", "null"], description: "Minimum community rating, 0-10 scale." },
      textQuery: {
        type: ["string", "null"],
        description: "Free-text search for niche sub-genres not in the main genre list (e.g. 'gangster', 'heist'). null if unused.",
      },
      seenFilter: {
        type: "string",
        enum: ["any", "unseen", "seen_only"],
        description: "Default 'unseen'. Use 'seen_only' when the user wants titles they've already watched (rewatch, rewatchable, already seen). Use 'any' only when the user explicitly says they want the full catalog.",
      },
      maxViolence: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Max allowed violence/gore severity. null = no cap.",
      },
      maxSexualContent: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Max allowed sexual content / nudity severity. null = no cap.",
      },
      maxLanguageSubstance: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Max allowed language/drug/substance-abuse severity. null = no cap.",
      },
      maxScaryIntense: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Max allowed scary/intense severity. null = no cap.",
      },
      maxSensitiveThemes: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Max allowed sensitive-themes severity (suicide, abuse, animal death, etc.). null = no cap.",
      },
      minViolence: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Minimum required violence severity. Set when user wants brutal/ultra-violent/Saw-level. null = no floor.",
      },
      minSexualContent: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Minimum required sexual/nudity severity. Set when user wants steamy/erotic/explicit. null = no floor.",
      },
      minLanguageSubstance: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Minimum required language/drug/substance severity. Set when user wants stoner/heavy-drug content. null = no floor.",
      },
      minScaryIntense: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Minimum required scary/intense severity. Set when user wants really-scary/terrifying. null = no floor.",
      },
      minSensitiveThemes: {
        type: ["string", "null"],
        enum: [...SEVERITY_ORDER, null],
        description: "Minimum required sensitive-themes severity. Set when user wants dark/disturbing/bleak. null = no floor.",
      },
      moods: {
        type: "array",
        items: { type: "string", enum: [...MOODS] },
        description: "Hidden mood tags that shape results beyond genres. Pick 0-3 based on the user's described tone. Always set when user describes mood, especially for TV where Romance/Horror/Thriller genres don't exist.",
      },
      originalLanguage: {
        type: "array",
        items: { type: "string" },
        description: "Whitelist of TMDB 2-letter language codes. Empty if unspecified.",
      },
      excludeOriginalLanguages: {
        type: "array",
        items: { type: "string" },
        description: "Blacklist of TMDB 2-letter language codes. 'foreign films' = ['en']. Empty if unspecified.",
      },
      excludeAnime: {
        type: "boolean",
        description: "True only when the user says 'no anime'. Server removes Japanese-origin Animation specifically.",
      },
      runtime: {
        type: "array",
        items: { type: "string", enum: ["short", "feature", "long", "epic"] },
        description: "Runtime buckets (movies only). short=<90, feature=90-120, long=120-150, epic=>150. Empty if unspecified.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "0-3 short natural-language phrases for niche themes TMDB tracks as keywords (e.g. 'future', 'time loop', 'christmas', 'road trip', 'heist'). Empty if no niche theme named.",
      },
      excludeKeywords: {
        type: "array",
        items: { type: "string" },
        description: "0-3 niche themes to EXCLUDE (TMDB without_keywords). 'no time travel'/'no zombies'/'nothing post-apocalyptic'. Whole-genre exclusions go in excludeGenres. Empty if user didn't name a theme to avoid.",
      },
      studios: {
        type: "array",
        items: { type: "string", enum: [...STUDIO_NAMES] },
        description: "Production company names the user named. Whitelist-only ('A24', 'Studio Ghibli', 'Shudder', 'Marvel Studios', 'Pixar', 'Walt Disney Pictures', etc.). Filters via TMDB with_companies; do NOT also add the studio name to keywords. Empty for 'A24-style' or unsupported studios.",
      },
      mpaaRatings: {
        type: "array",
        items: { type: "string", enum: [...ALL_CERTS] },
        description: "Explicit MPAA (G/PG/PG-13/R/NC-17) or TV (TV-Y..TV-MA) certifications the user named. 'X max' / 'X or lower' expands to X plus every lower rung. Empty if user didn't cite a rating.",
      },
      cast: {
        type: "array",
        items: { type: "string" },
        description: "0-3 actor/director full names the user named. Only for explicit people ('Tom Hanks', 'by X'). Do NOT set for style comparisons or franchises.",
      },
      limit: { type: "integer", minimum: 5, maximum: 25, description: "Number of titles to include (default 10)." },
      suggestedName: { type: "string", description: "Short friendly name for the collection." },
    },
    required: ["mediaType", "genres", "excludeGenres", "yearFrom", "yearTo", "minRating", "textQuery", "seenFilter", "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes", "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "runtime", "keywords", "excludeKeywords", "studios", "mpaaRatings", "cast", "limit", "suggestedName"],
    additionalProperties: false,
  },
};

function normalizeSeverity(v: unknown): Severity | null {
  if (typeof v !== "string") return null;
  return (SEVERITY_ORDER as readonly string[]).includes(v) ? (v as Severity) : null;
}

export async function extractCollectionFilters(userPrompt: string): Promise<CollectionFilters> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [{ type: "text", text: getSystemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [EXTRACT_COLLECTION_TOOL],
    tool_choice: { type: "tool", name: "set_collection_filters" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return structured filters");
  }
  const raw = toolUse.input as Partial<CollectionFilters>;
  const validGenres = new Set(TMDB_MOVIE_GENRES);
  let extractedGenres = Array.isArray(raw.genres)
    ? raw.genres.filter((g) => validGenres.has(g as (typeof TMDB_MOVIE_GENRES)[number]))
    : [];

  // Safety net: AI sometimes whiffs on extraction and returns empty genres
  // even when the prompt names a canonical genre directly ("Classic war
  // movies from before 2005" → returned []). detectGenresFromPrompt scans
  // for canonical genre patterns and force-adds anything missing. Only
  // fires when the AI left genres empty — if it picked something, trust it.
  if (extractedGenres.length === 0) {
    const detected = detectGenresFromPrompt(userPrompt, validGenres);
    if (detected.length > 0) {
      console.warn(
        `Collection AI: extracted empty genres for prompt "${userPrompt.slice(0, 60)}..." — force-added ${detected.join(", ")}`,
      );
      extractedGenres = detected;
    }
  }

  return {
    mediaType: (raw.mediaType === "tv" || raw.mediaType === "any") ? raw.mediaType : "movie",
    genres: extractedGenres,
    excludeGenres: Array.isArray(raw.excludeGenres) ? raw.excludeGenres.filter((g) => validGenres.has(g as (typeof TMDB_MOVIE_GENRES)[number])) : [],
    yearFrom: typeof raw.yearFrom === "number" && raw.yearFrom > 1800 ? Math.floor(raw.yearFrom) : null,
    // Strip yearTo when it's a redundant current-year ceiling paired with a
    // yearFrom — model sometimes fills it in on "last N years" prompts even
    // though the system prompt says not to.
    yearTo: (() => {
      if (typeof raw.yearTo !== "number" || raw.yearTo <= 1800) return null;
      const y = Math.floor(raw.yearTo);
      const currentYear = new Date().getFullYear();
      const hasFrom = typeof raw.yearFrom === "number" && raw.yearFrom > 1800;
      if (hasFrom && y >= currentYear - 1) return null;
      return y;
    })(),
    minRating: typeof raw.minRating === "number" && raw.minRating >= 0 && raw.minRating <= 10 ? raw.minRating : null,
    // Strip textQuery if it's a single vibe/reputation word — those over-
    // narrow because TMDB doesn't tag films by reputation. The system
    // prompt tells the AI to map them to moods, but this is the safety net.
    textQuery: (() => {
      if (typeof raw.textQuery !== "string") return null;
      const t = raw.textQuery.trim();
      if (t.length === 0) return null;
      if (isVibeDescriptor(t)) return null;
      return t;
    })(),
    seenFilter: raw.seenFilter === "seen_only" || raw.seenFilter === "any" ? raw.seenFilter : "unseen",
    maxViolence: normalizeSeverity(raw.maxViolence),
    maxSexualContent: normalizeSeverity(raw.maxSexualContent),
    maxLanguageSubstance: normalizeSeverity(raw.maxLanguageSubstance),
    maxScaryIntense: normalizeSeverity(raw.maxScaryIntense),
    maxSensitiveThemes: normalizeSeverity(raw.maxSensitiveThemes),
    minViolence: normalizeSeverity(raw.minViolence),
    minSexualContent: normalizeSeverity(raw.minSexualContent),
    minLanguageSubstance: normalizeSeverity(raw.minLanguageSubstance),
    minScaryIntense: normalizeSeverity(raw.minScaryIntense),
    minSensitiveThemes: normalizeSeverity(raw.minSensitiveThemes),
    moods: Array.isArray(raw.moods) ? (raw.moods.filter((m) => (MOODS as readonly string[]).includes(m)) as Mood[]) : [],
    originalLanguage: Array.isArray(raw.originalLanguage) ? raw.originalLanguage.filter((l): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [],
    excludeOriginalLanguages: Array.isArray(raw.excludeOriginalLanguages) ? raw.excludeOriginalLanguages.filter((l): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [],
    excludeAnime: raw.excludeAnime === true,
    runtime: Array.isArray(raw.runtime) ? raw.runtime.filter((r): r is string => typeof r === "string" && ["short", "feature", "long", "epic"].includes(r)) : [],
    keywords: Array.isArray(raw.keywords)
      ? stripVibeKeywords(raw.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0 && k.length < 50).map((k) => k.trim().toLowerCase())).slice(0, 3)
      : [],
    excludeKeywords: Array.isArray(raw.excludeKeywords)
      ? stripVibeKeywords(raw.excludeKeywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0 && k.length < 50).map((k) => k.trim().toLowerCase())).slice(0, 3)
      : [],
    studios: Array.isArray(raw.studios)
      ? raw.studios.filter((s): s is string => typeof s === "string" && (STUDIO_NAMES as readonly string[]).includes(s)).slice(0, 5)
      : [],
    mpaaRatings: Array.isArray(raw.mpaaRatings)
      ? raw.mpaaRatings.filter((r): r is string => typeof r === "string" && (ALL_CERTS as readonly string[]).includes(r))
      : [],
    cast: Array.isArray(raw.cast)
      ? raw.cast.filter((n): n is string => typeof n === "string" && n.trim().length > 0 && n.length < 100).map((n) => n.trim()).slice(0, 3)
      : [],
    limit: typeof raw.limit === "number" ? Math.max(5, Math.min(25, Math.floor(raw.limit))) : 10,
    suggestedName: typeof raw.suggestedName === "string" && raw.suggestedName.trim().length > 0 ? raw.suggestedName.trim().slice(0, 80) : "Custom Collection",
  };
}
