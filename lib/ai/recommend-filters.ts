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

export interface ExtractedFilters {
  mediaType: "movie" | "tv" | "any";
  genres: string[];
  experience: string[];
  runtime: string[];
  era: string[];
  excludeGenres: string[];
}

const SYSTEM_PROMPT = `You extract structured movie/TV recommendation filters from a user's description of what they feel like watching.

You do NOT suggest or name any movies or shows. You only pick filter values from the fixed vocabularies below. The site's own recommendation engine will do the actual search against a real movie database.

Be conservative. If a dimension isn't clearly implied by the user, leave it empty. Don't pad the result. It's better to return too few filters than to force-fit values that weren't actually requested.

Genre mapping:
- "sci-fi" / "science fiction" / "cyberpunk" / "space" → "Science Fiction"
- "rom-com" → "Comedy" + "Romance"
- "superhero" / "comic book" → "Action" + "Adventure"
- "slasher" / "gore" → "Horror"
- "heist" / "detective" / "noir" → "Crime"
- "biopic" / "period piece" → "History" or "Drama"
- "kid-friendly" / "for my kids" → "Family" + "Animation"

Runtime buckets (movies only):
- "short" (<90 min): "short", "quick"
- "feature" (90-120): "normal length"
- "long" (120-150): "long"
- "epic" (>150): "epic", "marathon"

Era values:
- "classic" = pre-1970, "70s" / "80s" / "90s" / "2000s" / "2010s"
- "recent" = 2020+

Experience tags — pick only when clearly implied:
- "thought-provoking" (cerebral, makes you think)
- "feel-good" (uplifting, light)
- "tearjerker" (sad, emotional)
- "dark" (grim, bleak)
- "funny" (comedic, goofy)
- "edge-of-seat" (suspenseful, tense)
- "epic" (grand-scale)
- "offbeat" (weird, indie, quirky)
- "romantic" (love story)
- "scary" (horror, frightening)
- "inspiring" (motivational)
- "mind-bending" (twisty, surreal)`;

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
    },
    required: ["mediaType", "genres", "experience", "runtime", "era", "excludeGenres"],
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
  };
}
