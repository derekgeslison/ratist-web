// Shared safety net for AI filter extractors (collections, recommend, /movies AI).
// When the AI whiffs and returns no genres for a prompt that clearly names one,
// scan the prompt for canonical genre patterns and force-add the matches.
//
// Patterns are conservative — only triggered when the genre word is used as a
// noun-like reference ("war movies", "horror films") rather than as a stray
// adjective or verb. False positives here are worse than misses, since the
// helper only fires when the AI extraction was already empty.

const PROMPT_GENRE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:war\s+(?:movies?|films?|stories|epics?)|(?:movies?|films?)\s+about\s+wars?)\b/i, "War"],
  [/\bhorror\b/i, "Horror"],
  [/\b(?:comed(?:y|ies)|comedy\s+films?|funny\s+(?:movies?|films?))\b/i, "Comedy"],
  [/\b(?:thrillers?|thriller\s+(?:movies?|films?))\b/i, "Thriller"],
  [/\b(?:westerns?|western\s+(?:movies?|films?))\b/i, "Western"],
  [/\b(?:documentar(?:y|ies)|docs?\b)/i, "Documentary"],
  [/\b(?:myster(?:y|ies))\b/i, "Mystery"],
  [/\b(?:musicals?)\b/i, "Music"],
  [/\b(?:romance\s+(?:movies?|films?)|romantic\s+(?:movies?|films?)|rom-?coms?)\b/i, "Romance"],
  [/\b(?:fantas(?:y|ies)\s+(?:movies?|films?)?|fantasy\b)/i, "Fantasy"],
  [/\b(?:sci-?fi|science\s+fiction|scifi)\b/i, "Science Fiction"],
  [/\b(?:dramas?\s+(?:movies?|films?)?|drama\s+films?)\b/i, "Drama"],
  [/\b(?:family\s+(?:movies?|films?)|kids?\s+(?:movies?|films?))\b/i, "Family"],
  [/\b(?:animated\s+(?:movies?|films?)|animation\s+(?:movies?|films?)?|cartoons?)\b/i, "Animation"],
  [/\b(?:adventure\s+(?:movies?|films?))\b/i, "Adventure"],
  [/\b(?:action\s+(?:movies?|films?))\b/i, "Action"],
  [/\b(?:crime\s+(?:movies?|films?)|gangster\s+(?:movies?|films?)|mob\s+(?:movies?|films?))\b/i, "Crime"],
  [/\b(?:historical\s+(?:movies?|films?)|history\s+(?:movies?|films?)|period\s+pieces?)\b/i, "History"],
];

/** Scan a user prompt for canonical TMDB genre names. Returns the genres
 *  found, in the order they're matched. Caller decides what to do with
 *  the result — typically only used as a fallback when the AI returned no
 *  genres of its own. Capped at 3 to mirror the AI's typical 1-3 outputs.
 *
 *  `validGenres` filters the output to only genres the caller's downstream
 *  schema accepts (some flows omit "TV Movie", for example).
 */
export function detectGenresFromPrompt(prompt: string, validGenres?: ReadonlySet<string>): string[] {
  const detected: string[] = [];
  for (const [pattern, genre] of PROMPT_GENRE_PATTERNS) {
    if (validGenres && !validGenres.has(genre)) continue;
    if (pattern.test(prompt) && !detected.includes(genre)) detected.push(genre);
  }
  return detected.slice(0, 3);
}
