import { getWatchProviders, getMovieDetails } from "@/lib/tmdb";
import { prisma } from "@/lib/prisma";

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  /** Optional non-blocking note to show the user when they're eligible but metadata is thin. */
  warning?: string;
}

// How many days after release we still treat a no-provider film as likely
// still in its theatrical window. 45 days covers the typical modern
// theatrical-to-PVOD window (usually 17–45 days now post-pandemic).
const THEATRICAL_WINDOW_DAYS = 45;

/**
 * Determines whether a movie is eligible for Watch Companion generation.
 *
 * Signal:
 *   1. If TMDB lists any US flatrate/rent/buy provider → eligible. Digital
 *      availability proves the film is out.
 *   2. Otherwise, only block when the film was released in the last
 *      THEATRICAL_WINDOW_DAYS days (still probably in theaters). Older
 *      films with no digital providers are very often DVD/Blu-ray-only
 *      (Criterion, older foreign films, out-of-print indies) — blocking
 *      those would hit exactly the audiences where a companion is most
 *      useful. Let them through.
 *
 * Errors fall back to eligible — we'd rather let a generation through
 * than block incorrectly when TMDB has a hiccup.
 */
export async function isMovieEligibleForCompanion(tmdbId: number): Promise<EligibilityResult> {
  try {
    // Adult-content gate. Block companion generation on titles that
    // are either flagged adult by TMDB, rated NC-17, OR have no/NR
    // rating AND have been admin/auto-flagged as having explicit
    // posters (the posterBlocked signal). LLM-generated watch
    // companions on hardcore titles are off-product and a waste of
    // credits regardless of who's requesting.
    const dbMovie = await prisma.movie.findUnique({
      where: { tmdbId },
      select: { mpaaRating: true, posterBlocked: true },
    }).catch(() => null);
    const adultBlocked =
      dbMovie?.mpaaRating === "NC-17"
      || ((dbMovie?.mpaaRating === "NR" || dbMovie?.mpaaRating == null) && dbMovie?.posterBlocked === true);
    if (adultBlocked) {
      return {
        eligible: false,
        reason: "This title isn't eligible for a Watch Companion.",
      };
    }
    // TMDB-side adult flag is a separate signal — porn entries on
    // TMDB carry adult: true even when our DB row is fresh. Cheap to
    // check via the same getMovieDetails call we'd make below for the
    // theatrical-window logic.
    const movieDetails = await getMovieDetails(tmdbId).catch(() => null);
    if (movieDetails && (movieDetails as { adult?: boolean }).adult === true) {
      return {
        eligible: false,
        reason: "This title isn't eligible for a Watch Companion.",
      };
    }

    const providers = await getWatchProviders(tmdbId);
    const hasAnyProvider = !!(providers?.flatrate?.length || providers?.rent?.length || providers?.buy?.length);
    if (hasAnyProvider) return { eligible: true };

    // Reuse the movieDetails fetched for the adult-flag check above
    // when possible — saves an extra TMDB round trip.
    const movie = movieDetails ?? await getMovieDetails(tmdbId);
    const release = movie.release_date ? new Date(movie.release_date) : null;
    const now = new Date();
    if (!release || release > now) {
      return {
        eligible: false,
        reason: "This movie hasn't been released yet. Watch Companions are generated once the film is out.",
      };
    }
    const daysSinceRelease = (now.getTime() - release.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRelease < THEATRICAL_WINDOW_DAYS) {
      return {
        eligible: false,
        reason: "This movie is still in its theatrical window. Check back once it's available for rent, streaming, or home release.",
      };
    }
    // Older film with no digital providers — assume DVD/Blu-ray availability
    // (TMDB doesn't track physical media) and let it through.
    return { eligible: true };
  } catch (err) {
    console.error("isMovieEligibleForCompanion error (allowing through):", err);
    return { eligible: true };
  }
}

/**
 * Soft metadata-quality check. Returns a warning string if grounding data
 * looks thin — used to inform the user *before* they spend a credit, never
 * to block them. Returns null if metadata looks fine.
 */
export async function assessCompanionDataQuality(
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<string | null> {
  try {
    // Cheap check: if the movie has an overview + some cast, quality is
    // probably fine. Skip TV for now — shows almost always have rich
    // metadata, and the extra TMDB call isn't worth the cost.
    if (mediaType !== "movie") return null;
    const movie = await getMovieDetails(tmdbId);
    const m = movie as unknown as { overview?: string; credits?: { cast?: unknown[] } };
    const hasOverview = !!(m.overview && m.overview.length > 60);
    const castCount = Array.isArray(m.credits?.cast) ? m.credits.cast.length : 0;
    const hasThinCast = castCount < 5;

    if (!hasOverview && hasThinCast) {
      return "Heads up: we have very little background info on this title. Your companion may be noticeably thinner than usual. You can still generate and help fill it in via suggestions.";
    }
    if (!hasOverview || hasThinCast) {
      return "Heads up: limited background info available for this title — your companion may be less detailed than usual.";
    }
    return null;
  } catch {
    return null;
  }
}

export async function isCompanionEligible(
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<EligibilityResult> {
  if (mediaType === "tv") {
    const warning = await assessCompanionDataQuality(mediaType, tmdbId);
    return warning ? { eligible: true, warning } : { eligible: true };
  }
  const result = await isMovieEligibleForCompanion(tmdbId);
  if (!result.eligible) return result;
  const warning = await assessCompanionDataQuality(mediaType, tmdbId);
  return warning ? { eligible: true, warning } : { eligible: true };
}
