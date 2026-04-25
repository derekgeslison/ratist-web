// Grounding data fetchers for the Watch Companion generator. Pulls factual
// context from Wikipedia + TMDB so Claude has a real source to synthesize from
// rather than relying on training-data memory. Everything fails closed — if a
// fetcher returns nothing, the generator still proceeds with whatever it has.

import { getMovieDetails, getShowDetails, type TMDBMovie, type TMDBShow } from "@/lib/tmdb";
import { getSubtitleForTmdb, type SubtitleFailureReason } from "@/lib/opensubtitles";
import { parseSrt, renderCuesForPrompt } from "@/lib/srt-parser";

/**
 * Surfaceable status of the subtitle-fetch step for one grounding call.
 * `ok=true` always pairs with a usable excerpt; `ok=false` includes the
 * reason and a human-readable message so the admin generation UI can
 * tell the moderator why the AI is falling back to runtime-percentage
 * estimates instead of dialogue-anchored timestamps.
 */
export type SubtitleStatus =
  | { ok: true; remaining: number | null }
  | { ok: false; reason: SubtitleFailureReason; message: string };

interface WikipediaPage {
  title: string;
  extract: string; // plain text summary
  url: string;
}

/**
 * Fetch Wikipedia summary for a movie or show title (optionally with year) via
 * the public REST API. Returns null when nothing is found.
 */
export async function fetchWikipediaPage(title: string, year?: number | null, mediaType?: "movie" | "tv"): Promise<WikipediaPage | null> {
  // Try a few canonical disambiguation variants, most specific first.
  const candidates: string[] = [];
  if (year) {
    candidates.push(`${title} (${year} film)`);
    candidates.push(`${title} (${year} TV series)`);
  }
  if (mediaType === "tv") candidates.push(`${title} (TV series)`);
  if (mediaType === "movie") candidates.push(`${title} (film)`);
  candidates.push(title);

  for (const candidate of candidates) {
    const page = await fetchPageSummary(candidate);
    if (page && page.extract.length > 100) return page;
  }

  // Fall back to the search endpoint if none of the canonical variants matched.
  const searchHit = await searchWikipedia(`${title}${year ? ` ${year}` : ""}${mediaType === "tv" ? " television series" : mediaType === "movie" ? " film" : ""}`);
  if (searchHit) {
    const page = await fetchPageSummary(searchHit);
    if (page) return page;
  }
  return null;
}

async function fetchPageSummary(pageTitle: string): Promise<WikipediaPage | null> {
  try {
    const encoded = encodeURIComponent(pageTitle.replace(/ /g, "_"));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      headers: { "User-Agent": "Ratist/1.0 (https://www.theratist.com)" },
      // Revalidate daily — Wikipedia pages don't change minute-to-minute.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    if (!data.extract) return null;
    return {
      title: data.title ?? pageTitle,
      extract: data.extract,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
    };
  } catch {
    return null;
  }
}

async function searchWikipedia(query: string): Promise<string | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", query);
    url.searchParams.set("srlimit", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Ratist/1.0 (https://www.theratist.com)" },
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { query?: { search?: Array<{ title: string }> } };
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

/**
 * For TV shows: pull per-episode summaries for a given season via Wikipedia's
 * section parser. Many prestige shows have a dedicated "List of X episodes"
 * page; fall back to the main show page's "Episodes" section. Best-effort —
 * returns [] on failure and the generator uses TMDB episode overviews instead.
 */
export async function fetchWikipediaEpisodeList(showTitle: string, year?: number | null): Promise<string | null> {
  const candidates = [
    `List of ${showTitle} episodes`,
    `${showTitle} (season 1)`,
    `${showTitle} (${year ?? ""} TV series) episodes`,
  ];
  for (const candidate of candidates) {
    const page = await fetchPageSummary(candidate);
    if (page && page.extract.length > 300) return page.extract;
  }
  return null;
}

// A sampled dialogue excerpt from an English subtitle file. The label
// identifies where the excerpt came from ("Movie" for films, "S1E3 —
// 'The Pointy End'" for TV) so the AI can anchor timestamp references
// to the correct episode when multiple are present.
export interface SubtitleExcerpt {
  label: string;
  // Episode metadata, present for TV excerpts. The downstream prompt uses
  // these to build visibleAfter values from raw [M:SS] timestamps in the
  // cue block (which are seconds-within-episode, not absolute).
  season?: number;
  episode?: number;
  cues: string; // pre-rendered "[M:SS] line" block, already trimmed to budget
}

export interface CompanionGroundingData {
  source: "movie" | "tv";
  title: string;
  year: number | null;
  runtimeSeconds: number | null;
  overview: string;
  wikipedia: WikipediaPage | null;
  wikipediaEpisodes: string | null;
  tmdb: TMDBMovie | TMDBShow;
  cast: Array<{ tmdbId: number; name: string; character: string; order: number; profilePath: string | null }>;
  seasons?: Array<{ seasonNumber: number; episodeCount: number; overview: string | null; episodes: Array<{ episodeNumber: number; name: string; overview: string | null; runtime: number | null }> }>;
  // One excerpt per fetch attempt that returned dialogue. Movies always
  // produce a single-element array; TV produces one entry per episode in
  // the target season that had subs available.
  subtitleExcerpts?: SubtitleExcerpt[];
  // Status for every fetch attempt (success + failure), in episode order
  // for TV. The orchestrator aggregates failures by reason before emitting
  // warnings so admins don't see ten near-identical messages.
  subtitleStatuses?: SubtitleStatus[];
}

/**
 * Pull everything Claude needs about a movie or show before generating.
 * @param tmdbId
 * @param mediaType
 * @param seasonNumber — for tv, restrict to one season's episodes (others still listed at cast/overview level).
 */
export async function loadGroundingForMovie(tmdbId: number): Promise<CompanionGroundingData> {
  const tmdb = await getMovieDetails(tmdbId);
  const year = tmdb.release_date ? parseInt(tmdb.release_date.slice(0, 4), 10) : null;
  const wiki = await fetchWikipediaPage(tmdb.title, year, "movie");
  const cast = (tmdb.credits?.cast ?? []).slice(0, 25).map((c) => ({
    tmdbId: c.id,
    name: c.name,
    character: c.character,
    order: c.order ?? 0,
    profilePath: c.profile_path ?? null,
  }));
  const { excerpt, status } = await fetchSubtitleExcerpt(tmdbId, "movie");
  return {
    source: "movie",
    title: tmdb.title,
    year,
    runtimeSeconds: tmdb.runtime ? tmdb.runtime * 60 : null,
    overview: tmdb.overview ?? "",
    wikipedia: wiki,
    wikipediaEpisodes: null,
    tmdb,
    cast,
    subtitleExcerpts: excerpt ? [excerpt] : [],
    subtitleStatuses: [status],
  };
}

export async function loadGroundingForShow(tmdbId: number, seasonNumber: number): Promise<CompanionGroundingData> {
  const tmdb = await getShowDetails(tmdbId);
  const year = tmdb.first_air_date ? parseInt(tmdb.first_air_date.slice(0, 4), 10) : null;
  const wiki = await fetchWikipediaPage(tmdb.name, year, "tv");
  const wikiEps = await fetchWikipediaEpisodeList(tmdb.name, year);
  const cast = (tmdb.aggregate_credits?.cast ?? []).slice(0, 35).map((c) => ({
    tmdbId: c.id,
    name: c.name,
    character: Array.isArray(c.roles) && c.roles.length > 0 ? c.roles.map((r) => r.character).filter(Boolean).join(" / ") : "",
    order: c.order ?? 0,
    profilePath: c.profile_path ?? null,
  }));

  const seasons = (tmdb.seasons ?? [])
    .filter((s) => s.season_number > 0) // drop specials (season 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      episodeCount: s.episode_count ?? 0,
      overview: s.overview ?? null,
      episodes: [] as Array<{ episodeNumber: number; name: string; overview: string | null; runtime: number | null }>,
    }));
  // Fetch episode detail for the target season only (we only generate one
  // season at a time; other seasons show up as metadata).
  const targetSeason = seasons.find((s) => s.seasonNumber === seasonNumber);
  if (targetSeason) {
    const episodes = await fetchSeasonEpisodes(tmdbId, seasonNumber).catch(() => []);
    targetSeason.episodes = episodes;
  }

  // Pull subtitles for EVERY episode in the target season (was: just ep 1
  // as a quota-saving measure during early development). Per-episode cue
  // budget shrinks as the season grows so the combined excerpt stays
  // within ~30k chars total — the 18k single-episode default is fine for
  // a movie or a 1–2 episode pull, but a 10-episode season at 18k each
  // would drown the prompt.
  const targetEpisodes = targetSeason?.episodes ?? [];
  const episodeNumbers = targetEpisodes.length > 0
    ? targetEpisodes.map((e) => e.episodeNumber)
    : [1]; // fallback when TMDB didn't return episode metadata
  const TOTAL_SUBTITLE_BUDGET = 30000;
  const PER_EP_FLOOR = 1500;
  const PER_EP_CEIL = 18000;
  const perEpisodeBudget = Math.min(
    PER_EP_CEIL,
    Math.max(PER_EP_FLOOR, Math.floor(TOTAL_SUBTITLE_BUDGET / episodeNumbers.length)),
  );
  const episodeNameMap = new Map<number, string>(
    targetEpisodes.map((e) => [e.episodeNumber, e.name] as const),
  );

  // Parallel fetch — OpenSubtitles handles concurrent calls fine and the
  // grounding step otherwise becomes the wall-clock bottleneck for a
  // 10-episode season. If we ever start hitting per-second rate limits
  // we can swap for a small concurrency pool.
  const fetched = await Promise.all(
    episodeNumbers.map((ep) =>
      fetchSubtitleExcerpt(
        tmdbId,
        "tv",
        seasonNumber,
        ep,
        perEpisodeBudget,
        episodeNameMap.get(ep),
      ),
    ),
  );
  const subtitleExcerpts = fetched
    .map((r) => r.excerpt)
    .filter((e): e is SubtitleExcerpt => e !== null);
  const subtitleStatuses = fetched.map((r) => r.status);

  return {
    source: "tv",
    title: tmdb.name,
    year,
    runtimeSeconds: null,
    overview: tmdb.overview ?? "",
    wikipedia: wiki,
    wikipediaEpisodes: wikiEps,
    tmdb,
    cast,
    seasons,
    subtitleExcerpts,
    subtitleStatuses,
  };
}

/**
 * Pulls one English subtitle file for the target and thins it to a
 * ~4-5k-token dialogue excerpt. Returns null whenever OpenSubtitles is
 * unavailable, the API key/credentials are missing, or quota is exhausted
 * — generation proceeds without subtitles in all these cases.
 *
 * Strategy is deliberately modest: one file per gen (the movie itself, or
 * ep 1 of the target season) so free-tier accounts don't blow their daily
 * quota on a single TV season.
 */
async function fetchSubtitleExcerpt(
  tmdbId: number,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number,
  maxChars?: number,
  episodeName?: string,
): Promise<{ excerpt: SubtitleExcerpt | null; status: SubtitleStatus }> {
  try {
    const result = await getSubtitleForTmdb(tmdbId, mediaType, season, episode);
    if (!result.ok) {
      return { excerpt: null, status: result };
    }
    const cues = parseSrt(result.srt);
    if (cues.length === 0) {
      return {
        excerpt: null,
        status: { ok: false, reason: "all_filtered", message: "Subtitle file downloaded but contained no parseable cues." },
      };
    }
    const rendered = renderCuesForPrompt(cues, maxChars);
    if (!rendered) {
      return {
        excerpt: null,
        status: { ok: false, reason: "all_filtered", message: "Subtitle cues parsed but rendered empty." },
      };
    }
    const label = mediaType === "movie"
      ? "Movie"
      : episodeName
        ? `S${season ?? "?"}E${episode ?? 1} — "${episodeName}"`
        : `S${season ?? "?"}E${episode ?? 1}`;
    return {
      excerpt: {
        label,
        cues: rendered,
        ...(mediaType === "tv" ? { season, episode } : {}),
      },
      status: { ok: true, remaining: result.remaining },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fetchSubtitleExcerpt error (proceeding without):", err);
    return {
      excerpt: null,
      status: { ok: false, reason: "network_error", message: `Subtitle fetch threw: ${message}` },
    };
  }
}

async function fetchSeasonEpisodes(tmdbId: number, seasonNumber: number) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${apiKey}&language=en-US`,
      { next: { revalidate: 60 * 60 * 24 * 7 } },
    );
    if (!res.ok) return [];
    const data = await res.json() as { episodes?: Array<{ episode_number: number; name: string; overview: string; runtime: number | null }> };
    return (data.episodes ?? []).map((e) => ({
      episodeNumber: e.episode_number,
      name: e.name,
      overview: e.overview,
      runtime: e.runtime,
    }));
  } catch {
    return [];
  }
}
