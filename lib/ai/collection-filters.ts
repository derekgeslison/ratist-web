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

### Negative constraints
When the user says "not X", "nothing too X", "avoid X", "but not X", "without X":
- If X is a genre → put it in excludeGenres (NOT in genres), even if the overall topic is adjacent. Example: "Halloween movies for kids, nothing too scary" → genres: [Family, Fantasy], excludeGenres: [Horror].

### Genre mapping
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

### Year mapping
- "70s" → yearFrom: 1970, yearTo: 1979. Same pattern for 80s/90s/2000s/2010s.
- "recent"/"new"/"modern" → yearFrom: 2020.
- "golden age"/"Hollywood classic era" → yearTo: 1960.
- "classic" ALONE (e.g. "classic gangster movies", "classic comedies") usually means canonical / iconic, NOT a specific era. LEAVE yearFrom and yearTo null in this case — don't force a year filter.

### Other
- "rated above X" / "higher than X" / "over X stars" → minRating: X (0-10 scale, community vote average).
- "haven't seen" / "new to me" / "unseen" → excludeSeen: true. Default excludeSeen to true unless the user explicitly wants all titles.
- Don't over-stuff genres — pick the 1-3 most clearly implied.
- Limit defaults to 10, cap at 25.
- suggestedName: a short, friendly title for the collection (e.g. "Classic Gangster Movies", "Unseen 80s Sci-Fi").

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
