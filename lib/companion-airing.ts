const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

// Recaps + subtitles + transcripts for a freshly-aired episode are typically
// not online for ~24-48h. We require this many days past an episode's TMDB
// air_date before we consider it eligible to generate. The same buffer
// drives the "season is currently airing" check — a season is airing while
// (last_episode.air_date + AIRING_BUFFER_DAYS) is still in the future.
export const AIRING_BUFFER_DAYS = 2;

export interface SeasonAiringStatus {
  /** True when (last_episode.air_date + 2 days) > today. */
  airing: boolean;
  /** Episode numbers whose air_date + 2 days <= today. May be empty when an
   *  airing season has no episodes past the buffer yet. */
  eligibleEpisodes: number[];
  /** All episode numbers in this season (aired + future). */
  allEpisodes: number[];
  /** Latest air_date on any episode in this season (covers unaired episodes
   *  that are already scheduled in TMDB). Null when TMDB has no air dates
   *  for any episode of this season. */
  lastEpisodeAirDate: Date | null;
}

/**
 * Determine whether a season is currently airing per the
 * (last_episode_airdate + 2 days > today) rule, and which episodes have
 * passed the 2-day eligibility buffer for generation.
 *
 * Errors fall back to a conservative `{ airing: false, ... }` — better to
 * treat an unknown season as not-airing (and run the existing full-season
 * flow) than to incorrectly enter an airing state without TMDB data.
 */
export async function getSeasonAiringStatus(
  tmdbId: number,
  seasonNumber: number,
  now: Date = new Date(),
): Promise<SeasonAiringStatus> {
  const fallback: SeasonAiringStatus = {
    airing: false,
    eligibleEpisodes: [],
    allEpisodes: [],
    lastEpisodeAirDate: null,
  };
  if (!TMDB_API_KEY) return fallback;
  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=en-US`,
      { next: { revalidate: 60 * 60 * 6 } },
    );
    if (!res.ok) return fallback;
    const data = await res.json() as {
      episodes?: Array<{ episode_number: number; air_date: string | null }>;
    };
    const episodes = data.episodes ?? [];
    if (episodes.length === 0) return fallback;

    const today = startOfDay(now);
    const bufferMs = AIRING_BUFFER_DAYS * 24 * 60 * 60 * 1000;
    const eligibleEpisodes: number[] = [];
    const allEpisodes: number[] = [];
    let lastDate: Date | null = null;
    for (const ep of episodes) {
      allEpisodes.push(ep.episode_number);
      if (!ep.air_date) continue;
      const airDate = startOfDay(new Date(ep.air_date));
      if (Number.isNaN(airDate.getTime())) continue;
      if (lastDate === null || airDate > lastDate) lastDate = airDate;
      if (airDate.getTime() + bufferMs <= today.getTime()) {
        eligibleEpisodes.push(ep.episode_number);
      }
    }
    eligibleEpisodes.sort((a, b) => a - b);

    // Airing := (last episode's air_date + 2 days) > today. Strict >,
    // matching the user-confirmed rule from 2026-04-25 — the day the
    // buffer fully passes flips the season to not-airing.
    const airing = lastDate !== null
      ? (lastDate.getTime() + bufferMs) > today.getTime()
      : false;

    return { airing, eligibleEpisodes, allEpisodes, lastEpisodeAirDate: lastDate };
  } catch (err) {
    console.error("getSeasonAiringStatus failed (treating as not airing):", err);
    return fallback;
  }
}

/**
 * Lightweight check used by route handlers to refuse generation of an
 * airing season whose episodes haven't yet cleared the 2-day buffer.
 * Distinct return type from SeasonAiringStatus so callers don't accidentally
 * proceed with an empty eligibleEpisodes list.
 */
export type AiringTriggerDecision =
  | { kind: "not_airing"; status: SeasonAiringStatus }
  | { kind: "airing_with_eligible"; status: SeasonAiringStatus }
  | { kind: "airing_too_early"; status: SeasonAiringStatus };

export async function decideAiringTrigger(
  tmdbId: number,
  seasonNumber: number,
  now: Date = new Date(),
): Promise<AiringTriggerDecision> {
  const status = await getSeasonAiringStatus(tmdbId, seasonNumber, now);
  if (!status.airing) return { kind: "not_airing", status };
  if (status.eligibleEpisodes.length === 0) return { kind: "airing_too_early", status };
  return { kind: "airing_with_eligible", status };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
