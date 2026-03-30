/**
 * Required fields that must be filled for a rating to be considered "complete".
 * Matches the `required: true` fields in app/movies/[id]/rate/page.tsx
 */
export const REQUIRED_RATING_FIELDS = [
  "plot", "storytelling", "pacingClimax",     // Story
  "cinematography", "artisticEffect",          // Production & Style
  "overallEmotion", "relatability",            // Emotive Effect
  "casting", "actingQuality",                  // Acting & Casting
  "appeal",                                    // Pure Entertainment
] as const;

export type RequiredRatingField = (typeof REQUIRED_RATING_FIELDS)[number];

export type RatingStatus = "complete" | "incomplete";

/** Returns "complete" if all required fields are non-null, "incomplete" otherwise. */
export function getRatingStatus(rating: Record<string, unknown> | null): RatingStatus {
  if (!rating) return "incomplete";
  return REQUIRED_RATING_FIELDS.every((f) => rating[f] != null) ? "complete" : "incomplete";
}
