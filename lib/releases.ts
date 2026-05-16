/**
 * Release calendar helpers — fetch upcoming theatrical/digital
 * releases from TMDB's discover endpoint with flexible filters.
 *
 * The TMDB discover endpoint already supports release-date ranges,
 * release types, regions, genres, and certifications, so we can
 * lean on it rather than building a local index. Personalization
 * (matching upcoming films against a user's genre persona) wraps
 * the same call with auto-generated filter values.
 */
import type { TMDBMovie, TMDBPageResult, TMDBShow } from "./tmdb";
import { getMovieDetails, getShowDetails } from "./tmdb";
import { prisma } from "./prisma";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

/** TMDB release_type values:
 *   1 = Premiere
 *   2 = Theatrical (limited)
 *   3 = Theatrical (wide)
 *   4 = Digital
 *   5 = Physical
 *   6 = TV
 *
 * For "Coming Soon" defaults we use 2|3 (any theatrical) plus 4
 * (digital) — covers everything a casual user would call "the
 * release date." 5 and 6 surface specialty tracking that bloats
 * the calendar.
 */
export const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "Premiere",
  2: "Theatrical (limited)",
  3: "Theatrical",
  4: "Digital",
  5: "Physical",
  6: "TV",
};

export interface ReleaseFilters {
  /** ISO 3166-1 alpha-2 country code. Drives both `region` (which
   *  TMDB uses to scope which release dates apply) and the
   *  certification country. Defaults to "US". */
  region?: string;
  /** YYYY-MM-DD inclusive lower bound on primary_release_date. */
  fromDate: string;
  /** YYYY-MM-DD inclusive upper bound. */
  toDate: string;
  /** TMDB genre IDs. Multi-genre is OR-matched (TMDB default). */
  genres?: number[];
  /** TMDB release types — see RELEASE_TYPE_LABELS. Comma-joined as
   *  "2|3" syntax in the TMDB query, which is OR. */
  releaseTypes?: number[];
  /** MPA cert codes (e.g., "PG-13"). Multi is OR-matched. */
  certifications?: string[];
  /** Sort order. TMDB defaults to popularity.desc which is a
   *  reasonable Coming-Soon order. */
  sortBy?: "popularity.desc" | "primary_release_date.asc" | "primary_release_date.desc" | "vote_average.desc";
  /** 1-based page number. */
  page?: number;
}

const DEFAULT_RELEASE_TYPES = [2, 3, 4]; // theatrical (limited+wide) + digital

/** Run a TMDB /discover/movie query with the given filters. Returns
 *  the paged result; callers handle pagination and downstream
 *  display.
 *
 *  Filter strategy: `release_date.gte/lte` (regional date) + `region`
 *  + `with_release_type`. With `region` set, TMDB's `release_date`
 *  filter narrows to films with a release of the specified types
 *  IN THAT REGION within the date range. The returned `release_date`
 *  field on each result is the regional date (matches the filter
 *  semantics), so the displayed date is always within our window.
 *
 *  Why not `primary_release_date.gte/lte`: the primary date is the
 *  film's global premiere, not regional. Combined with `region=US`
 *  this filtered by global date but displayed the regional date,
 *  causing three problems on /releases (2026-04-29):
 *    1. Films already released in the US showing as upcoming
 *       (US date in past, primary date still in window).
 *    2. Films with US releases far outside the window showing up
 *       (primary in window, US release months later).
 *    3. Foreign films with no US release at all surfacing because
 *       `region` doesn't strictly filter the result set.
 *
 *  Trade-off: `release_date.*` matches ANY release event of the
 *  given types, which can include re-releases of older films
 *  (anniversary editions, restored prints, country-specific re-
 *  releases). For a "next 6 months" view this is rare in practice;
 *  the primary-release approach's mis-dating was visible on every
 *  page load.
 *
 *  Default sort is popularity.desc. Sorting by release date asc
 *  surfaces obscure foreign films at the top (earliest in
 *  chronological order), which isn't what users want from a
 *  "Coming Soon" feed.
 */
export async function getReleases(filters: ReleaseFilters): Promise<TMDBPageResult<TMDBMovie>> {
  const region = filters.region ?? "US";
  const types = (filters.releaseTypes ?? DEFAULT_RELEASE_TYPES).join("|");

  const params = new URLSearchParams({
    api_key: API_KEY ?? "",
    sort_by: filters.sortBy ?? "popularity.desc",
    "release_date.gte": filters.fromDate,
    "release_date.lte": filters.toDate,
    with_release_type: types,
    with_original_language: "en",
    region,
    page: String(filters.page ?? 1),
    include_adult: "false",
  });

  if (filters.genres && filters.genres.length > 0) {
    // Pipe-joined = OR. Comma-joined would be AND, which makes the
    // result set very small.
    params.set("with_genres", filters.genres.join("|"));
  }
  if (filters.certifications && filters.certifications.length > 0) {
    params.set("certification_country", region);
    params.set("certification", filters.certifications.join("|"));
  }

  const res = await fetch(`${BASE}/discover/movie?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 6 }, // 6h cache, lighter than the leaderboard pages
  });
  if (!res.ok) {
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }
  const data: TMDBPageResult<TMDBMovie> = await res.json();
  // Defensive client-side date filter. TMDB's discover endpoint is
  // surprisingly fuzzy with date ranges when combined with region —
  // historically we've seen results with release_date outside the
  // requested window slip through. ISO YYYY-MM-DD strings sort
  // lexically so direct comparison is safe.
  const filtered = data.results.filter((m) => {
    if (!m.release_date) return false;
    return m.release_date >= filters.fromDate && m.release_date <= filters.toDate;
  });
  return { ...data, results: filtered };
}

/** Fetch the first N pages of a release query in parallel and stitch
 *  them into a single popularity-sorted feed. The release calendar
 *  loads 8 pages (~160 films) per window because page 1 alone
 *  ("Load more"-once) leaves users below the well-known release
 *  catalog — popularity-sort within a 6-month window puts the
 *  obviously-anticipated films across pages 1-8 and the long-tail
 *  niche stuff at page 9+. Pages beyond the actual `total_pages`
 *  return empty `results` from TMDB, so over-asking is safe.
 *
 *  Dedups by movie.id — TMDB pagination is generally stable, but
 *  ties on the popularity sort key can yield duplicates near page
 *  boundaries.
 */
export async function getReleasesMultiPage(
  filters: Omit<ReleaseFilters, "page">,
  pageCount: number,
): Promise<TMDBPageResult<TMDBMovie>> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      getReleases({ ...filters, page: i + 1 }),
    ),
  );
  const seen = new Set<number>();
  const results: TMDBMovie[] = [];
  for (const p of pages) {
    for (const m of p.results) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      results.push(m);
    }
  }
  const first = pages[0];
  return {
    page: 1,
    results,
    total_pages: first?.total_pages ?? 0,
    total_results: first?.total_results ?? 0,
  };
}

/** Unified shape for a single release calendar entry. Both movies
 *  and shows collapse to this so the date-grouped UI on /releases
 *  can treat them uniformly. `mediaType` is the discriminator the
 *  tile renderer uses to pick /movies/[id] vs /shows/[id].
 */
export interface UnifiedRelease {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  popularity: number;
  backdrop_path: string | null;
  overview: string;
  genre_ids: number[];
  /** Set on streaming-launch entries (Phase C). When present, the
   *  entry represents an item newly available on a streaming
   *  service rather than a primary release. The number is the
   *  TMDB provider id (matches STREAMING_PROVIDERS in lib/tmdb.ts). */
  streamingProviderId?: number;
}

export function movieToUnified(m: TMDBMovie): UnifiedRelease {
  return {
    id: m.id,
    mediaType: "movie",
    title: m.title,
    poster_path: m.poster_path,
    release_date: m.release_date ?? "",
    vote_average: m.vote_average ?? 0,
    popularity: m.popularity ?? 0,
    backdrop_path: m.backdrop_path ?? null,
    overview: m.overview ?? "",
    genre_ids: [],
  };
}

export function showToUnified(s: TMDBShow): UnifiedRelease {
  return {
    id: s.id,
    mediaType: "tv",
    title: s.name,
    poster_path: s.poster_path,
    release_date: s.first_air_date ?? "",
    vote_average: s.vote_average ?? 0,
    popularity: s.popularity ?? 0,
    backdrop_path: s.backdrop_path ?? null,
    overview: s.overview ?? "",
    genre_ids: [],
  };
}

export interface ShowReleaseFilters {
  /** YYYY-MM-DD inclusive lower bound on first_air_date. */
  fromDate: string;
  /** YYYY-MM-DD inclusive upper bound. */
  toDate: string;
  /** TMDB genre IDs. Multi-genre is OR-matched. */
  genres?: number[];
  /** Sort order. Default popularity.desc. */
  sortBy?: "popularity.desc" | "first_air_date.asc" | "first_air_date.desc" | "vote_average.desc";
  /** 1-based page number. */
  page?: number;
}

/** TV-show counterpart to getReleases. Series-premiere only — TMDB's
 *  /discover/tv filters by `first_air_date`, which is the show's
 *  premiere (S01E01) date. Per-season premiere dates aren't a
 *  /discover-level filter; surfacing those needs the snapshot
 *  workstream that hits /tv/{id} per popular show.
 *
 *  Note: TMDB doesn't expose a "release_type" or certification
 *  filter for TV the way it does for movies. The /discover/tv
 *  endpoint also doesn't accept region — TV releases are usually
 *  global from a network/streamer's perspective, so the region
 *  selector is movies-only.
 */
export async function getShowReleases(filters: ShowReleaseFilters): Promise<TMDBPageResult<TMDBShow>> {
  const params = new URLSearchParams({
    api_key: API_KEY ?? "",
    sort_by: filters.sortBy ?? "popularity.desc",
    "first_air_date.gte": filters.fromDate,
    "first_air_date.lte": filters.toDate,
    // English-original-language filter is the only viable
    // US-focus filter for /discover/tv, since the endpoint
    // doesn't accept `region` at all. Cuts the K-drama/anime/
    // telenovela mass that dominates global TV popularity
    // pages 4-8.
    with_original_language: "en",
    page: String(filters.page ?? 1),
    include_adult: "false",
    include_null_first_air_dates: "false",
  });
  if (filters.genres && filters.genres.length > 0) {
    params.set("with_genres", filters.genres.join("|"));
  }

  const res = await fetch(`${BASE}/discover/tv?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 6 },
  });
  if (!res.ok) {
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }
  const data: TMDBPageResult<TMDBShow> = await res.json();
  // Defensive client-side date filter — same reasoning as the movie
  // path. /discover/tv is less prone to fuzziness without region
  // complications, but it's a cheap insurance against TMDB drift.
  const filtered = data.results.filter((s) => {
    if (!s.first_air_date) return false;
    return s.first_air_date >= filters.fromDate && s.first_air_date <= filters.toDate;
  });
  return { ...data, results: filtered };
}

/** Multi-page parallel fetcher for TV — same shape as getReleasesMultiPage. */
export async function getShowReleasesMultiPage(
  filters: Omit<ShowReleaseFilters, "page">,
  pageCount: number,
): Promise<TMDBPageResult<TMDBShow>> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      getShowReleases({ ...filters, page: i + 1 }),
    ),
  );
  const seen = new Set<number>();
  const results: TMDBShow[] = [];
  for (const p of pages) {
    for (const s of p.results) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      results.push(s);
    }
  }
  const first = pages[0];
  return {
    page: 1,
    results,
    total_pages: first?.total_pages ?? 0,
    total_results: first?.total_results ?? 0,
  };
}

/** A streaming-launch event detected by diffing daily snapshots.
 *  `launchDate` is the snapshot day where the provider first
 *  appeared after a prior day where it didn't.
 */
export interface StreamingLaunchEvent {
  tmdbId: number;
  mediaType: "movie" | "tv";
  providerId: number;
  launchDate: string; // YYYY-MM-DD
}

/** A streaming-launch event enriched with TMDB metadata and
 *  classified as streaming-first (no prior theatrical) or post-
 *  theatrical (had a release_type 2|3 entry). Used by the /releases
 *  surface to decide whether the event goes in the main calendar
 *  feed or the "Coming to streaming" section.
 */
export interface ClassifiedLaunchEvent {
  unified: UnifiedRelease;
  isStreamingFirst: boolean;
}

/** Detect newly-added streaming providers by diffing daily snapshots
 *  in the lookback window. For each (tmdbId, mediaType) pair, walk
 *  snapshots in date order — any providerId that appears on day N
 *  but not on day N-1 is a launch event with launchDate = day N.
 *
 *  Bootstrap: if an item has only one snapshot in the window, we
 *  emit nothing for it. We can't tell whether the providers are
 *  newly added or just always-been-there. The cron must run for
 *  at least 2 days before any events surface, which is intentional.
 *
 *  Returns events in ascending launchDate order.
 */
export async function detectStreamingLaunches(
  region: string,
  lookbackDays: number,
): Promise<StreamingLaunchEvent[]> {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);

  const rows = await prisma.mediaProviderSnapshot.findMany({
    where: { region, snapshotDate: { gte: cutoff } },
    orderBy: [{ tmdbId: "asc" }, { mediaType: "asc" }, { snapshotDate: "asc" }],
    select: { tmdbId: true, mediaType: true, providerIds: true, snapshotDate: true },
  });

  const events: StreamingLaunchEvent[] = [];
  let i = 0;
  while (i < rows.length) {
    // Group rows for the same (tmdbId, mediaType).
    let j = i;
    while (
      j < rows.length &&
      rows[j].tmdbId === rows[i].tmdbId &&
      rows[j].mediaType === rows[i].mediaType
    ) j++;
    const group = rows.slice(i, j);
    i = j;

    if (group.length < 2) continue; // bootstrap: need a prior day to diff

    for (let k = 1; k < group.length; k++) {
      const prevSet = new Set(group[k - 1].providerIds);
      for (const pid of group[k].providerIds) {
        if (prevSet.has(pid)) continue;
        events.push({
          tmdbId: group[k].tmdbId,
          mediaType: group[k].mediaType as "movie" | "tv",
          providerId: pid,
          launchDate: group[k].snapshotDate.toISOString().slice(0, 10),
        });
      }
    }
  }

  return events;
}

/** Hydrate launch events with TMDB metadata and classify as
 *  streaming-first vs post-theatrical. Streaming-first = no prior
 *  release_type=2|3 entry in the movie's release_dates. For TV,
 *  we treat everything as streaming-first for now — TV "theatrical"
 *  is not a meaningful concept here.
 *
 *  Throttle: events are processed in chunks of `concurrency` to
 *  avoid bursting TMDB. Failed lookups (404, timeout) are silently
 *  dropped — a launch event without metadata isn't useful to show.
 */
export async function classifyLaunchEvents(
  events: StreamingLaunchEvent[],
  concurrency = 10,
): Promise<ClassifiedLaunchEvent[]> {
  const out: ClassifiedLaunchEvent[] = [];

  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (ev) => {
        try {
          if (ev.mediaType === "movie") {
            const m = await getMovieDetails(ev.tmdbId);
            // Streaming-first if NO release_dates entry for ANY country
            // has type 2 or 3 (theatrical). Most TMDB-tracked films
            // have release_dates populated even if they're streaming-
            // only — TMDB just doesn't add type 2|3 entries.
            const hadTheatrical = (m.release_dates?.results ?? []).some(
              (r) => r.release_dates.some((rd) => rd.type === 2 || rd.type === 3),
            );
            return {
              unified: {
                ...movieToUnified(m),
                // Override release_date with launchDate so the
                // calendar groups this entry under the streaming
                // launch day, not the film's primary release.
                release_date: ev.launchDate,
                streamingProviderId: ev.providerId,
              },
              isStreamingFirst: !hadTheatrical,
            };
          } else {
            const s = await getShowDetails(ev.tmdbId);
            return {
              unified: {
                ...showToUnified(s),
                release_date: ev.launchDate,
                streamingProviderId: ev.providerId,
              },
              // TV "post-theatrical" isn't a meaningful split — treat
              // all TV launches as streaming-first.
              isStreamingFirst: true,
            };
          }
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) if (r) out.push(r);
  }

  return out;
}

/** Map UserProfile genre fields back to TMDB genre IDs. Mirror of
 *  TMDB_GENRE_TO_PROFILE in lib/profile.ts but reversed. Multiple
 *  TMDB genres can collapse to one profile field (e.g., 28 Action
 *  and 12 Adventure both go to genreAction); for personalization
 *  we use the most representative TMDB id for each. */
const PROFILE_TO_TMDB_GENRES: Array<{ key: string; tmdbId: number }> = [
  { key: "genreAction",      tmdbId: 28 },
  { key: "genreAnimation",   tmdbId: 16 },
  { key: "genreComedy",      tmdbId: 35 },
  { key: "genreCrime",       tmdbId: 80 },
  { key: "genreDocumentary", tmdbId: 99 },
  { key: "genreDrama",       tmdbId: 18 },
  { key: "genreFamily",      tmdbId: 10751 },
  { key: "genreFantasy",     tmdbId: 14 },
  { key: "genreHistorical",  tmdbId: 36 },
  { key: "genreHorror",      tmdbId: 27 },
  { key: "genreMusical",     tmdbId: 10402 },
  { key: "genreMystery",     tmdbId: 9648 },
  { key: "genreRomance",     tmdbId: 10749 },
  { key: "genreScifi",       tmdbId: 878 },
  { key: "genreThriller",    tmdbId: 53 },
  { key: "genreWestern",     tmdbId: 37 },
];

/** Returns the TMDB genre IDs the user scores highest on. Used to
 *  filter the For You release feed so we only surface releases that
 *  match the user's existing taste profile.
 *
 *  We just take the top N regardless of absolute score — minScore=5
 *  was excluding For You for users who haven't rated enough films
 *  to push any genre above the midpoint, which is most signed-in
 *  users. The genre scoring is relative; what matters is "what does
 *  this user prefer compared to other genres," not absolute > 5.
 *  Returns null when there's no profile at all (anonymous or
 *  zero-rating user) so the caller can hide the section entirely. */
export async function getUserTopTmdbGenres(
  userId: string,
  count: number = 5,
): Promise<number[] | null> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const scored = PROFILE_TO_TMDB_GENRES.map((g) => ({
    tmdbId: g.tmdbId,
    score: (profile as unknown as Record<string, number>)[g.key] ?? 0,
  }));
  // If every score is exactly 0, the user has no profile data yet —
  // return null so we don't surface a "personalized" feed that's
  // actually just popularity-sorted upcoming films.
  if (scored.every((g) => g.score === 0)) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((g) => g.tmdbId);
}
