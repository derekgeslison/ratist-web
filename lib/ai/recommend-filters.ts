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

const EXPERIENCE_TAGS = [
  "thought-provoking", "feel-good", "tearjerker", "dark", "funny",
  "edge-of-seat", "epic", "offbeat", "romantic", "scary", "inspiring",
  "mind-bending",
] as const;

const RUNTIME_BUCKETS = ["short", "feature", "long", "epic"] as const;

const ERA_VALUES = ["classic", "70s", "80s", "90s", "2000s", "2010s", "recent"] as const;

// Must match STREAMING_PROVIDERS `short` values in lib/tmdb.ts
const PROVIDERS = ["Netflix", "Prime", "Disney+", "Hulu", "Max", "Apple TV+", "Peacock", "Paramount+"] as const;

export interface ExtractedFilters {
  mediaType: "movie" | "tv" | "any";
  genres: string[];
  experience: string[];
  runtime: string[];
  era: string[];
  excludeGenres: string[];
  providers: string[];
}

const SYSTEM_PROMPT = `You extract structured movie/TV recommendation filters from a user's description of what they feel like watching.

You do NOT suggest or name any movies or shows. You only pick filter values from the fixed vocabularies below. The site's own recommendation engine will do the actual search against a real movie database.

Be conservative. If a dimension isn't clearly implied by the user, leave it empty. Don't pad the result. It's better to return too few filters than to force-fit values that weren't actually requested.

### Anti-duplication rule (important)
If a concept fits a genre, DON'T also add it as an experience tag:
- "romance" / "rom-com" → genre "Romance" — do NOT also set experience "romantic"
- "comedy" / "funny movie" → genre "Comedy" — do NOT also set experience "funny"
- "horror" / "scary movie" → genre "Horror" — do NOT also set experience "scary"
- "epic adventure" → genre "Adventure" — do NOT also set experience "epic" unless the user specifically emphasized scale
Experience tags are for FEELINGS beyond genre ("thought-provoking", "feel-good", "dark", "mind-bending", "tearjerker", "offbeat", "inspiring", "edge-of-seat"). Only use them when the user's wording implies a mood that a genre alone wouldn't capture.

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

### Experience tags (use sparingly — see Anti-duplication above)
"thought-provoking", "feel-good", "tearjerker", "dark", "funny", "edge-of-seat", "epic", "offbeat", "romantic", "scary", "inspiring", "mind-bending"

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
    },
    required: ["mediaType", "genres", "experience", "runtime", "era", "excludeGenres", "providers"],
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
  };
}
