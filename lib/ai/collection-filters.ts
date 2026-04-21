import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";

// TMDB genre names — exactly as TMDB returns them, used to map to genre IDs downstream
export const TMDB_MOVIE_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller",
  "War", "Western",
] as const;

export interface CollectionFilters {
  mediaType: "movie" | "tv" | "any";
  genres: string[];
  excludeGenres: string[];
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number | null;
  textQuery: string | null;
  excludeSeen: boolean;
  limit: number;
  suggestedName: string;
}

const SYSTEM_PROMPT = `You extract structured filters for building a movie/TV collection from a user's natural-language prompt.

You do NOT name specific movies or shows. You only extract filter values. The site's recommendation engine will run the actual search against a real catalog.

Rules:
- Map synonyms to canonical genre names (e.g. "sci-fi" → "Science Fiction", "rom-com" → "Comedy" + "Romance").
- "classic" → yearTo: 1970. "70s" → yearFrom: 1970, yearTo: 1979. Same pattern for decades.
- "recent" / "new" → yearFrom: 2020.
- "rated above X" / "higher than X" → minRating: X (on a 0-10 scale using community vote average).
- "haven't seen" / "new to me" / "unseen" → excludeSeen: true. Default excludeSeen to true unless the user explicitly wants all titles.
- For niche genre terms that aren't in the main genre list (e.g. "gangster", "heist", "noir", "giallo", "zombie", "kung fu", "mockumentary"), put them in textQuery — the catalog does text search.
- Also pair textQuery with the closest main genre (gangster + heist → "Crime"; zombie → "Horror"; noir → "Crime" + "Thriller"; kung fu → "Action").
- Don't over-stuff genres — pick the 1-3 most clearly implied.
- Limit defaults to 10, cap at 25.
- suggestedName: a short, friendly title for the collection based on the prompt (e.g. "Classic Gangster Movies", "Unseen 80s Sci-Fi").

Be conservative. Leave fields null/empty if not clearly implied.`;

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
      excludeSeen: { type: "boolean", description: "Exclude titles the user has already marked as seen. Default true." },
      limit: { type: "integer", minimum: 5, maximum: 25, description: "Number of titles to include (default 10)." },
      suggestedName: { type: "string", description: "Short friendly name for the collection." },
    },
    required: ["mediaType", "genres", "excludeGenres", "yearFrom", "yearTo", "minRating", "textQuery", "excludeSeen", "limit", "suggestedName"],
    additionalProperties: false,
  },
};

export async function extractCollectionFilters(userPrompt: string): Promise<CollectionFilters> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
  return {
    mediaType: (raw.mediaType === "tv" || raw.mediaType === "any") ? raw.mediaType : "movie",
    genres: Array.isArray(raw.genres) ? raw.genres.filter((g) => validGenres.has(g as (typeof TMDB_MOVIE_GENRES)[number])) : [],
    excludeGenres: Array.isArray(raw.excludeGenres) ? raw.excludeGenres.filter((g) => validGenres.has(g as (typeof TMDB_MOVIE_GENRES)[number])) : [],
    yearFrom: typeof raw.yearFrom === "number" && raw.yearFrom > 1800 ? Math.floor(raw.yearFrom) : null,
    yearTo: typeof raw.yearTo === "number" && raw.yearTo > 1800 ? Math.floor(raw.yearTo) : null,
    minRating: typeof raw.minRating === "number" && raw.minRating >= 0 && raw.minRating <= 10 ? raw.minRating : null,
    textQuery: typeof raw.textQuery === "string" && raw.textQuery.trim().length > 0 ? raw.textQuery.trim() : null,
    excludeSeen: raw.excludeSeen !== false,
    limit: typeof raw.limit === "number" ? Math.max(5, Math.min(25, Math.floor(raw.limit))) : 10,
    suggestedName: typeof raw.suggestedName === "string" && raw.suggestedName.trim().length > 0 ? raw.suggestedName.trim().slice(0, 80) : "Custom Collection",
  };
}
