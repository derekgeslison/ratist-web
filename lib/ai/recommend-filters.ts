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

const SYSTEM_PROMPT = `You extract structured movie/TV recommendation filters from a user's description of what they feel like watching.

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

**Max caps** — user wants LESS of something:
- "not too graphic" / "not too violent" → maxViolence: "moderate"
- "no gore" → maxViolence: "mild"
- "no sex" / "no nudity" → maxSexualContent: "mild"
- "clean" / "no swearing" / "no drugs" → maxLanguageSubstance: "mild"
- "nothing scary" / "not too intense" → maxScaryIntense: "mild"
- "no animal deaths" / "nothing triggering" → maxSensitiveThemes: "moderate"
- "family-friendly" / "kid-safe" / "for my kids" → ALL caps at "mild"
- "with my mom, nothing too dark" → maxViolence/maxScary/maxSensitive at "moderate"

**Min caps** — user wants MORE of something:
- "very violent" / "brutal" / "gore porn" → minViolence: "moderate-severe"
- "sexy" / "steamy" / "erotic" / "lots of nudity" → minSexualContent: "moderate"
- "really scary" / "terrifying" → minScaryIntense: "moderate-severe"
- "dark and disturbing" / "bleak" → minSensitiveThemes: "moderate"
- "stoner flick" / "lots of drugs" → minLanguageSubstance: "moderate"

No kink-shaming — extract what the user asked for. Leave fields null when not mentioned.

### Providers (streaming services)
If the user mentions a service by name, add its short code. Otherwise leave empty.
- Netflix → "Netflix"
- Amazon Prime / Prime Video → "Prime"
- Disney Plus / Disney+ → "Disney+"
- Hulu → "Hulu"
- HBO Max / Max / HBO → "Max"
- Apple TV+ / Apple TV → "Apple TV+"
- Peacock → "Peacock"
- Paramount+ → "Paramount+"`;

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
    required: ["mediaType", "genres", "experience", "runtime", "era", "excludeGenres", "providers", "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes", "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes"],
    additionalProperties: false,
  },
};

export async function extractRecommendationFilters(userPrompt: string): Promise<ExtractedFilters> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
