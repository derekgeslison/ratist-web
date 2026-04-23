import { getWatchProviders, getMovieDetails } from "@/lib/tmdb";

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Determines whether a movie is eligible for Watch Companion generation.
 * A movie is eligible when it's actually available for users to watch —
 * we don't want users burning generation credits on films that haven't
 * left theaters yet or haven't been released.
 *
 * Signal used: TMDB /watch/providers (US). If any flatrate, rent, or buy
 * provider exists, the film is available. Otherwise we check the release
 * date to disambiguate "upcoming" vs "theatrical-only".
 *
 * Errors fall back to eligible — we'd rather let a generation through
 * than block incorrectly when TMDB has a hiccup.
 */
export async function isMovieEligibleForCompanion(tmdbId: number): Promise<EligibilityResult> {
  try {
    const providers = await getWatchProviders(tmdbId);
    const hasAnyProvider = !!(providers?.flatrate?.length || providers?.rent?.length || providers?.buy?.length);
    if (hasAnyProvider) return { eligible: true };

    const movie = await getMovieDetails(tmdbId);
    const release = movie.release_date ? new Date(movie.release_date) : null;
    const now = new Date();
    if (!release || release > now) {
      return {
        eligible: false,
        reason: "This movie hasn't been released yet. Watch Companions are generated once the film is out.",
      };
    }
    // Released but no rent/stream providers yet — almost always means it's
    // still running in theaters. Block until a rental/stream window opens.
    return {
      eligible: false,
      reason: "This movie isn't available for rent or streaming yet. Check back once it lands on a streaming service or rental platform.",
    };
  } catch (err) {
    console.error("isMovieEligibleForCompanion error (allowing through):", err);
    return { eligible: true };
  }
}

export async function isCompanionEligible(
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<EligibilityResult> {
  if (mediaType === "tv") return { eligible: true };
  return isMovieEligibleForCompanion(tmdbId);
}
