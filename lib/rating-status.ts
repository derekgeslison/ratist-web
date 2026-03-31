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

export type RatingStatus = "complete" | "incomplete" | "imported";

/**
 * Returns the status of a rating:
 *  - "complete" if all required fields are non-null
 *  - "imported" if it's an import or basic review with no component scores
 *  - "incomplete" otherwise (user started but didn't finish the form)
 */
export function getRatingStatus(rating: Record<string, unknown> | null): RatingStatus {
  if (!rating) return "incomplete";
  if (REQUIRED_RATING_FIELDS.every((f) => rating[f] != null)) return "complete";
  const noComponents = REQUIRED_RATING_FIELDS.every((f) => rating[f] == null);
  // Imported or basic review with no component scores → show score with info icon
  if (noComponents && (rating.importSource || rating.reviewType === "basic")) return "imported";
  return "incomplete";
}
