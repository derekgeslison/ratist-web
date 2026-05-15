/**
 * Color for a score 0-10: green (high) → yellow → red (low).
 *
 * Client-safe — used to color score badges across the site. Lives in
 * its own file so client components can import it WITHOUT pulling in
 * the server-only `lib/ratings.ts` (which holds proprietary weights
 * and threshold values).
 */
export function scoreColor(score: number): string {
  if (score >= 8) return "#22c55e";   // green-500
  if (score >= 6) return "#eab308";   // yellow-500
  if (score >= 4) return "#f97316";   // orange-500
  return "#ef4444";                    // red-500
}
