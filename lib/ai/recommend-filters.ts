import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";

// Canonical filter vocabulary. Keep these aligned with the /tools/recommend
// questionnaire and the /api/tools/recommend request schema so the AI output
// plugs straight into the existing search.
const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
] as const;

// Must match the four experience buttons rendered in the /tools/recommend
// filter drawer — anything else gets dropped at the server so the filter-count
// badge never overcounts hidden entries.
const EXPERIENCE_TAGS = ["popular", "hidden_gem", "classic", "taste"] as const;

const RUNTIME_BUCKETS = ["short", "feature", "long", "epic"] as const;

const ERA_VALUES = ["classic", "70s", "80s", "90s", "2000s", "2010s", "recent"] as const;

// Must match STREAMING_PROVIDERS `short` values in lib/tmdb.ts
const PROVIDERS = ["Netflix", "Prime", "Disney+", "Hulu", "Max", "Apple TV+", "Peacock", "Paramount+"] as const;

// Hidden "mood" tags — the AI can emit these to shape results in ways that
// genres alone can't capture (e.g. "dark" prefers Drama/Crime and avoids
// Comedy/Family). These are NOT surfaced as UI chips and don't count in the
// filter-drawer badge; the server expands them into genre adds/excludes.
export const MOODS = [
  "feel-good", "dark", "scary", "romantic", "tearjerker",
  "mind-bending", "thought-provoking", "epic", "inspiring", "offbeat",
  "funny", "edge-of-seat",
] as const;
export type Mood = (typeof MOODS)[number];

// Shared with lib/ai/collection-filters.ts — keep in lockstep
export const SEVERITY_ORDER = ["none", "mild", "mild-moderate", "moderate", "moderate-severe", "severe"] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

export interface ExtractedFilters {
  mediaType: "movie" | "tv" | "any";
  genres: string[];
  experience: string[];
  runtime: string[];
  era: string[];
  excludeGenres: string[];
  providers: string[];
  moods: Mood[];
  // TMDB 2-letter language codes. originalLanguage is an INCLUDE whitelist;
  // excludeOriginalLanguages is a BLACKLIST.
  originalLanguage: string[];
  excludeOriginalLanguages: string[];
  // Compound filter: "no anime" means Japanese-origin Animation only — we can't
  // just exclude Animation (over-excludes Pixar) or just exclude Japanese
  // (over-excludes Japanese live-action).
  excludeAnime: boolean;
  // Genre mode — "any" = match at least one selected genre (OR), "all" =
  // match every selected genre (AND). Inferred from the user's phrasing:
  // "or" / "either" → any; "and" / comma-only compounds → all. Single-genre
  // prompts stay "any" by default.
  genreMode: "any" | "all";
  // Precise year range that overrides era buckets when set. Use for prompts
  // like "1985–1995" or "summer 2023" that era buckets can't express.
  yearFrom: number | null;
  yearTo: number | null;
  // Community rating floor on TMDB's 0–10 scale.
  minRating: number | null;
  // Natural-language keyword phrases (1–3) that map to TMDB keyword tags for
  // niche themes not captured by genre/mood. Resolved server-side via
  // /search/keyword. Server falls back to no-keyword results if the keyword
  // query yields too few matches.
  keywords: string[];
  // MPAA movie ratings (G/PG/PG-13/R/NC-17) and US TV ratings (TV-Y through TV-MA).
  // /movies page uses a single `mpaa` URL param for both.
  mpaaRatings: string[];
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
}

const MPAA_RATINGS = ["G", "PG", "PG-13", "R", "NC-17"] as const;
const TV_RATINGS = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"] as const;
const ALL_CERTS = [...MPAA_RATINGS, ...TV_RATINGS] as const;

function buildSystemPrompt(currentYear: number): string {
  return `You extract structured movie/TV recommendation filters from a user's description of what they feel like watching.

You do NOT suggest or name any movies or shows. You only pick filter values from the fixed vocabularies below. The site's own recommendation engine will do the actual search against a real movie database.

Be conservative. If a dimension isn't clearly implied by the user, leave it empty. Don't pad the result. It's better to return too few filters than to force-fit values that weren't actually requested.

NEVER fill an array with all possible values as a way of saying "no filter". If the user didn't specify a dimension (genre, era, runtime, experience, provider), the array MUST be empty, not exhaustive. Example: "a Christmas movie" with no era hint → era: [], NOT [classic, 70s, 80s, 90s, 2000s, 2010s, recent].

### mediaType default
mediaType is "any" UNLESS the user explicitly says one of: "movie", "film", "flick", "feature" (→ "movie") or "show", "TV", "series", "season", "episode" (→ "tv"). Vague prompts like "a Christmas thing", "something romantic", "cozy rom-com", "scary", "slow burn sci-fi" → mediaType: "any". The word "movie" in the system name ("What Should I Watch?") does NOT count — only the user's own words count. Do not default to "movie" just because most catalog content is movies.

### Negative constraints (important)
When the user says "not too X", "nothing too X", "no X", "avoid X", "but not X", "without X", treat X as something to AVOID:
- If X is a genre → add it to excludeGenres (NOT to genres, even if the topic is related).
- "Halloween movie but nothing too scary" → genres: [Family, Fantasy], excludeGenres: [Horror]. Do NOT include Horror in genres just because Halloween is implied.
- "with my mom, nothing too dark" → excludeGenres: [Horror, Thriller].
- "something animated but not for little kids" → genres: [Animation], excludeGenres: [Family].
- "watching with my teenager" (no extra negation) → DO NOT default to genre "Family" alone; teens fit Comedy, Adventure, Action, Science Fiction, Fantasy. Pick 1-2 broadly teen-friendly genres and exclude Horror unless the user asked for it.

### Genre mode (any vs all)
genreMode defaults to "any" (OR). Only set "all" (AND) when multiple genres are picked and the user's phrasing makes intersection clear:
- "X and Y" / "X, Y" / "X Y" (comma or juxtaposition without "or") → "all". Example: "comedy drama show", "a comedy, drama tv show", "sci-fi horror", "action comedy".
- "X or Y" / "either X or Y" / "X or Y, I don't care which" → "any". Example: "comedy or action", "horror or thriller".
- Single genre → "any" (irrelevant but keep default).
- Mixed phrasing with "or" anywhere → "any" (the user explicitly opened the door to either).

### Genre mapping
- "sci-fi" / "science fiction" / "cyberpunk" / "space" → "Science Fiction"
- "rom-com" → "Comedy" + "Romance"
- "superhero" / "comic book" → "Action" + "Adventure"
- "slasher" / "gore" → "Horror"
- "heist" / "detective" / "noir" → "Crime"
- "biopic" / "period piece" → "History" or "Drama"
- "kid-friendly" / "for my kids" → "Family" + "Animation"

### Runtime buckets (movies only)
- "short" (<90 min): "short", "quick"
- "feature" (90-120): "normal length"
- "long" (120-150): "long"
- "epic" (>150): "epic", "marathon"

### Era values
- "classic" = pre-1970, "70s" / "80s" / "90s" / "2000s" / "2010s"
- "recent" = 2020+

### Experience tags (use sparingly)
Four values only — pick when the user is explicit; otherwise leave empty:
- "popular" → user wants currently-popular/well-known titles
- "classic" → user wants canon / highly-rated older/historical titles
- "hidden_gem" → user wants off-radar, highly-rated low-popularity titles
- "taste" → user references their own profile ("based on my taste", "what I'd like")

Do NOT invent tags. If the user says "feel-good" or "tearjerker" or "dark", leave experience EMPTY and let genres/excludeGenres do the work.

### Parents-guide severity caps
Five categories can be capped at a MAX (ceiling) or MIN (floor) severity: none < mild < mild-moderate < moderate < moderate-severe < severe.

**Max caps** — user wants LESS of something. ALWAYS set these when the phrasing matches, even in compound prompts ("no horror, no gore" → both excludeGenres Horror AND maxViolence:"mild"). Don't assume genre excludes alone cover it.
- "not too graphic" / "not too violent" → maxViolence: "moderate"
- "no gore" / "no blood" → maxViolence: "mild"
- "no sex" / "no nudity" → maxSexualContent: "mild"
- "clean" / "no swearing" / "no drugs" → maxLanguageSubstance: "mild"
- "nothing scary" / "not too intense" / "nothing too dark" → maxScaryIntense: "mild" AND maxSensitiveThemes: "moderate"
- "no jumpscares" / "not jumpy" → maxScaryIntense: "mild"
- "not too scary" → maxScaryIntense: "moderate"
- "no animal deaths" / "nothing triggering" → maxSensitiveThemes: "moderate"
- "family-friendly" / "kid-safe" / "for my kids" / "for my 8-year-old" → ALL five max caps at "mild"
- "with my mom, nothing too dark" → maxViolence/maxScary/maxSensitive at "moderate"

**Min caps** — user wants MORE of something:
- "very violent" / "brutal" / "gore porn" → minViolence: "moderate-severe"
- "sexy" / "steamy" / "erotic" / "lots of nudity" → minSexualContent: "moderate"
- "really scary" / "terrifying" → minScaryIntense: "moderate-severe"
- "dark and disturbing" / "bleak" → minSensitiveThemes: "moderate"
- "stoner flick" / "lots of drugs" → minLanguageSubstance: "moderate"

No kink-shaming — extract what the user asked for. Leave fields null when not mentioned.

### Moods (hidden tags — use liberally)
moods is a multi-select array used to shape results beyond what genres can capture. The server expands each mood into extra genres to include + genres to avoid. Pick 0-3 moods based on the tone the user describes:
- "feel-good": light, uplifting, cozy, heartwarming, "to cheer me up", "with my mom", "Christmas movie"
- "dark": gritty, bleak, noir, psychological, grim, "heavy", "not for the faint of heart"
- "scary": horror / frightening / terrifying — use with "scary", "horror", "terror", "chilling", "jumpscare"
- "romantic": love-driven, emotional — "date night", "love story", "rom-com", "romance"
- "tearjerker": "makes me cry", "sob", "heart-wrenching", "bittersweet"
- "mind-bending": twisty, nonlinear, reality-bending — "like Inception", "time loop", "mind-blown"
- "thought-provoking": cerebral, reflective — "makes you think", "philosophical", "existential"
- "epic": grand-scale, sweeping, long — "epic fantasy", "saga", "Lord of the Rings scale"
- "inspiring": uplifting-but-serious — "motivational", "underdog", "triumphant"
- "offbeat": weird, indie, arthouse — "A24-style", "quirky", "bizarre"
- "funny": comedic — "hilarious", "laugh-out-loud", "I need to laugh"
- "edge-of-seat": suspenseful — "keeps you guessing", "nail-biting"

ALWAYS set moods when the user describes tone; they compensate for cases where genre alone is thin. Example: "a dark TV show" → moods: ["dark"]. "a feel-good Christmas movie" → moods: ["feel-good"]. "a romantic show" for TV → moods: ["romantic"] (TV has no Romance genre; the mood compensates).

### Language / origin
Use TMDB 2-letter ISO codes. originalLanguage is an INCLUDE whitelist; excludeOriginalLanguages is a BLACKLIST. Common codes: en=English, ja=Japanese, ko=Korean, zh=Chinese (Mandarin), hi=Hindi, es=Spanish, fr=French, de=German, it=Italian, pt=Portuguese, ru=Russian, tr=Turkish, ar=Arabic, th=Thai, sv=Swedish, da=Danish, no=Norwegian, nl=Dutch, pl=Polish.

- "Korean thriller" / "K-drama" → originalLanguage: ["ko"] (K-drama also implies mediaType: "tv")
- "Bollywood" / "Hindi movie" → originalLanguage: ["hi"]
- "Japanese horror" → originalLanguage: ["ja"]
- "foreign films" / "subtitled movies" / "international cinema" → leave originalLanguage empty BUT set excludeOriginalLanguages: ["en"] (foreign = non-English from a US perspective)
- "no foreign films" / "no subtitles" / "English only" → originalLanguage: ["en"]
- "anime" (wanting) → originalLanguage: ["ja"] + genres: ["Animation"]

### Compound: anime exclusion
"no anime", "not anime", "I hate anime", "except anime" → set excludeAnime: true. Do NOT set excludeGenres: ["Animation"] for these prompts — that would also exclude Pixar/DreamWorks/etc. The server post-filters to remove only Japanese-origin animation. Leave excludeAnime false in all other cases.

### Precise year range (overrides era)
Today's year is ${currentYear}. If the user names a specific year or year span, set yearFrom/yearTo instead of using era buckets:
- "from 2018" / "released 2018" → yearFrom: 2018, yearTo: 2018
- "between 1985 and 1995" / "late 80s to mid 90s" → yearFrom: 1985, yearTo: 1995
- "before 2010" → yearTo: 2009 (no yearFrom)
- "after 2015" → yearFrom: 2015 (no yearTo)
- "in the last N years" / "past N years" / "the last decade" → yearFrom: ${currentYear} - N (or 10 for "decade"), yearTo: null. **Never set yearTo for open-ended relative phrases** — the user means "up to now", which is the default and doesn't need an upper bound.
- "released this year" → yearFrom: ${currentYear}, yearTo: ${currentYear}

When the user only says a decade like "80s", prefer the era bucket ("80s"); use yearFrom/yearTo only for specific year numbers or relative phrases.

### Min rating
- "highly rated" / "well-rated" / "only good stuff" → minRating: 7.5
- "rated 8 or above" / "at least 8 stars" / "8+" → minRating: 8
- "7+" / "at least 7" → minRating: 7
- "9 stars or higher" → minRating: 9
Leave null if the user doesn't cite a rating threshold or quality adjective.

### Keywords (niche themes)
keywords is an array of 1–3 short natural-language phrases that name themes genres can't capture. The server resolves each phrase to a TMDB keyword tag; if the keyword query yields too few titles, it falls back to regular genre results. Use keywords when the prompt names:
- setting/time: "set in the future" → "future"; "post-apocalyptic" → "post-apocalyptic"; "dystopia"/"dystopian" → "dystopia"; "set in space" → "space"; "set during WWII" → "world war ii"
- structural/technique: "time loop" → "time loop"; "found footage" → "found footage"; "one-shot" / "shot in one take" → "one-shot"; "nonlinear" → "nonlinear timeline"; "mockumentary" → "mockumentary"
- holidays/occasions: "christmas movie" → "christmas"; "halloween" → "halloween"; "thanksgiving" → "thanksgiving"; "valentine's" → "valentine's day"
- specific scenarios: "road trip" → "road trip"; "heist" → "heist" (use ALONGSIDE Crime genre); "courtroom" → "courtroom"; "prison" → "prison"; "high school" → "high school"; "boarding school" → "boarding school"; "wedding" → "wedding"; "first contact" → "first contact"; "serial killer" → "serial killer"

Do NOT pad with keywords. If the user didn't name a specific theme, leave keywords empty. Genres + moods already cover most prompts. Pick at most 3, prefer 1–2. Single-word phrases are best.

### Providers (streaming services)
If the user mentions a service by name, add its short code. Otherwise leave empty.
- Netflix → "Netflix"
- Amazon Prime / Prime Video → "Prime"
- Disney Plus / Disney+ → "Disney+"
- Hulu → "Hulu"
- HBO Max / Max / HBO → "Max"
- Apple TV+ / Apple TV → "Apple TV+"
- Peacock → "Peacock"
- Paramount+ → "Paramount+"

### Content ratings (MPAA + TV)
mpaaRatings is an array combining movie (${MPAA_RATINGS.join(", ")}) and TV (${TV_RATINGS.join(", ")}) certifications. Set only when the user explicitly asks for a rating — don't infer from adjacent words like "family-friendly" (use severity caps instead).
- "R-rated" / "rated R" → ["R"]
- "PG-13 or lower" → ["G", "PG", "PG-13"]
- "NC-17" → ["NC-17"]
- "TV-MA" / "mature TV" → ["TV-MA"]
- "TV-14" → ["TV-14"]
- "only R-rated stuff" → ["R"]
- "family-friendly" → leave empty; use severity caps (handles both movies and TV)`;
}

// Cache the built prompt per-year so cache_control keeps hitting within a year.
let cachedSystemPrompt: { year: number; text: string } | null = null;
function getSystemPrompt(): string {
  const year = new Date().getFullYear();
  if (cachedSystemPrompt && cachedSystemPrompt.year === year) return cachedSystemPrompt.text;
  cachedSystemPrompt = { year, text: buildSystemPrompt(year) };
  return cachedSystemPrompt.text;
}

const EXTRACT_FILTERS_TOOL: Anthropic.Tool = {
  name: "set_recommendation_filters",
  description: "Set the recommendation filters that will be used to search the catalog. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      mediaType: {
        type: "string",
        enum: ["movie", "tv", "any"],
        description: "What the user wants to watch. Default to 'any' if not specified.",
      },
      genres: {
        type: "array",
        items: { type: "string", enum: [...GENRES] },
        description: "Genres the user wants. Empty if unspecified.",
      },
      experience: {
        type: "array",
        items: { type: "string", enum: [...EXPERIENCE_TAGS] },
        description: "Mood/experience tags the user wants. Empty if unspecified.",
      },
      runtime: {
        type: "array",
        items: { type: "string", enum: [...RUNTIME_BUCKETS] },
        description: "Runtime buckets (movies only). Empty if unspecified.",
      },
      era: {
        type: "array",
        items: { type: "string", enum: [...ERA_VALUES] },
        description: "Era preferences. Empty if unspecified.",
      },
      excludeGenres: {
        type: "array",
        items: { type: "string", enum: [...GENRES] },
        description: "Genres the user explicitly wants to avoid. Empty if nothing to avoid.",
      },
      providers: {
        type: "array",
        items: { type: "string", enum: [...PROVIDERS] },
        description: "Streaming services the user wants. Empty if unspecified.",
      },
      moods: {
        type: "array",
        items: { type: "string", enum: [...MOODS] },
        description: "Hidden mood tags that shape results beyond genres. Pick 0-3 based on the user's described tone. Always set when the user describes a mood.",
      },
      originalLanguage: {
        type: "array",
        items: { type: "string" },
        description: "Whitelist of TMDB 2-letter language codes (en, ja, ko, hi, es, fr, de, it, etc.). Empty if unspecified.",
      },
      excludeOriginalLanguages: {
        type: "array",
        items: { type: "string" },
        description: "Blacklist of TMDB 2-letter language codes. Used for 'foreign films' (=excludeOriginalLanguages:['en']). Empty if unspecified.",
      },
      excludeAnime: {
        type: "boolean",
        description: "Set true only when the user says 'no anime'/'not anime'. Server removes Japanese-origin Animation specifically. Do NOT set for 'no animation' (use excludeGenres:['Animation'] for that).",
      },
      genreMode: {
        type: "string",
        enum: ["any", "all"],
        description: "'any' = OR (match at least one selected genre). 'all' = AND (match every selected genre). Default 'any'. Use 'all' only when the user's phrasing implies intersection (comma/juxtaposition without 'or', or explicit 'and').",
      },
      yearFrom: { type: ["integer", "null"], description: "Precise earliest year (overrides era). null if unspecified." },
      yearTo: { type: ["integer", "null"], description: "Precise latest year (overrides era). null if unspecified." },
      minRating: { type: ["number", "null"], description: "Community rating floor 0-10. null if user didn't cite a threshold." },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "0-3 short natural-language phrases for niche themes TMDB tracks as keywords (e.g. 'future', 'time loop', 'christmas', 'road trip', 'found footage', 'one-shot'). Empty if no niche theme named.",
      },
      mpaaRatings: {
        type: "array",
        items: { type: "string", enum: [...ALL_CERTS] },
        description: "Explicit MPAA (G/PG/PG-13/R/NC-17) or TV (TV-Y/TV-Y7/TV-G/TV-PG/TV-14/TV-MA) certifications the user named. Empty if user didn't cite a rating.",
      },
      maxViolence: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Max allowed violence severity. null = no cap." },
      maxSexualContent: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Max allowed sexual/nudity severity. null = no cap." },
      maxLanguageSubstance: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Max allowed language/drug severity. null = no cap." },
      maxScaryIntense: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Max allowed scary/intense severity. null = no cap." },
      maxSensitiveThemes: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Max allowed sensitive-themes severity. null = no cap." },
      minViolence: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Minimum required violence severity. Set when user wants brutal/gore-porn. null = no floor." },
      minSexualContent: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Minimum required sexual/nudity severity. Set when user wants steamy/erotic. null = no floor." },
      minLanguageSubstance: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Minimum required language/drug severity. Set when user wants stoner/heavy-drug. null = no floor." },
      minScaryIntense: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Minimum required scary/intense severity. Set when user wants terrifying. null = no floor." },
      minSensitiveThemes: { type: ["string", "null"], enum: [...SEVERITY_ORDER, null], description: "Minimum required sensitive-themes severity. Set when user wants dark/bleak. null = no floor." },
    },
    required: ["mediaType", "genres", "experience", "runtime", "era", "excludeGenres", "providers", "moods", "originalLanguage", "excludeOriginalLanguages", "excludeAnime", "genreMode", "yearFrom", "yearTo", "minRating", "keywords", "mpaaRatings", "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes", "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes"],
    additionalProperties: false,
  },
};

export async function extractRecommendationFilters(userPrompt: string): Promise<ExtractedFilters> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [{ type: "text", text: getSystemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [EXTRACT_FILTERS_TOOL],
    tool_choice: { type: "tool", name: "set_recommendation_filters" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return structured filters");
  }
  const input = toolUse.input as Partial<ExtractedFilters>;
  return {
    mediaType: (input.mediaType === "movie" || input.mediaType === "tv") ? input.mediaType : "any",
    genres: Array.isArray(input.genres) ? input.genres.filter((g) => (GENRES as readonly string[]).includes(g)) : [],
    experience: Array.isArray(input.experience) ? input.experience.filter((g) => (EXPERIENCE_TAGS as readonly string[]).includes(g)) : [],
    runtime: Array.isArray(input.runtime) ? input.runtime.filter((g) => (RUNTIME_BUCKETS as readonly string[]).includes(g)) : [],
    era: Array.isArray(input.era) ? input.era.filter((g) => (ERA_VALUES as readonly string[]).includes(g)) : [],
    excludeGenres: Array.isArray(input.excludeGenres) ? input.excludeGenres.filter((g) => (GENRES as readonly string[]).includes(g)) : [],
    providers: Array.isArray(input.providers) ? input.providers.filter((p) => (PROVIDERS as readonly string[]).includes(p)) : [],
    moods: Array.isArray(input.moods) ? (input.moods.filter((m) => (MOODS as readonly string[]).includes(m)) as Mood[]) : [],
    originalLanguage: Array.isArray(input.originalLanguage) ? input.originalLanguage.filter((l): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [],
    excludeOriginalLanguages: Array.isArray(input.excludeOriginalLanguages) ? input.excludeOriginalLanguages.filter((l): l is string => typeof l === "string" && /^[a-z]{2}$/.test(l)) : [],
    excludeAnime: input.excludeAnime === true,
    genreMode: input.genreMode === "all" ? "all" : "any",
    yearFrom: typeof input.yearFrom === "number" && input.yearFrom > 1800 && input.yearFrom < 2100 ? Math.floor(input.yearFrom) : null,
    // yearTo normalization: the model sometimes sets yearTo=currentYear on
    // "last N years" prompts even though we tell it not to. If yearFrom is set
    // and yearTo is within 1 year of "now", it's redundant — strip it so the
    // user doesn't see a pointless upper bound.
    yearTo: (() => {
      if (typeof input.yearTo !== "number" || input.yearTo <= 1800 || input.yearTo >= 2100) return null;
      const y = Math.floor(input.yearTo);
      const currentYear = new Date().getFullYear();
      const hasFrom = typeof input.yearFrom === "number" && input.yearFrom > 1800;
      if (hasFrom && y >= currentYear - 1) return null;
      return y;
    })(),
    minRating: typeof input.minRating === "number" && input.minRating >= 0 && input.minRating <= 10 ? input.minRating : null,
    keywords: Array.isArray(input.keywords)
      ? input.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0 && k.length < 50).map((k) => k.trim().toLowerCase()).slice(0, 3)
      : [],
    mpaaRatings: Array.isArray(input.mpaaRatings)
      ? input.mpaaRatings.filter((r): r is string => typeof r === "string" && (ALL_CERTS as readonly string[]).includes(r))
      : [],
    maxViolence: normalizeSeverity(input.maxViolence),
    maxSexualContent: normalizeSeverity(input.maxSexualContent),
    maxLanguageSubstance: normalizeSeverity(input.maxLanguageSubstance),
    maxScaryIntense: normalizeSeverity(input.maxScaryIntense),
    maxSensitiveThemes: normalizeSeverity(input.maxSensitiveThemes),
    minViolence: normalizeSeverity(input.minViolence),
    minSexualContent: normalizeSeverity(input.minSexualContent),
    minLanguageSubstance: normalizeSeverity(input.minLanguageSubstance),
    minScaryIntense: normalizeSeverity(input.minScaryIntense),
    minSensitiveThemes: normalizeSeverity(input.minSensitiveThemes),
  };
}

function normalizeSeverity(v: unknown): Severity | null {
  if (typeof v !== "string") return null;
  return (SEVERITY_ORDER as readonly string[]).includes(v) ? (v as Severity) : null;
}
