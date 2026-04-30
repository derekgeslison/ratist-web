// Resolve AI-suggested titles (from the hybrid Collections AI flow) to real
// TMDB ids. Each suggestion is a { title, year, mediaType } triple — we
// search TMDB by title, then pick the best match using year proximity and
// title similarity. Suggestions that don't match any plausible candidate
// are silently dropped (the route's filter-discovery fallback covers gaps).
import { searchMovies, searchShows, type TMDBMovie, type TMDBShow } from "../tmdb";
import type { SuggestedTitle } from "./collection-filters";

export interface ResolvedTitle {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  popularity: number;
  mediaType: "movie" | "tv";
  /** TMDB genre ids for downstream filtering (excludeGenres etc.). */
  genreIds: number[];
}

// Normalize for fuzzy comparison: lowercase, strip leading articles, drop
// non-alphanumerics. Handles "The Big Lebowski" vs "Big Lebowski" or
// "Léon: The Professional" vs "leon the professional".
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/** Score a TMDB candidate against the requested title+year. Higher = better.
 *  Returns a number in [0, 100+] where 100 represents an ideal match.
 *  Negative would mean reject (year mismatched too far). */
function scoreCandidate(
  candidate: { title: string; year: number | null; popularity: number },
  requested: { titleNormalized: string; year: number | null },
): number {
  const candidateNorm = normalize(candidate.title);
  let score = 0;

  // Title match: exact normalized match dominates.
  if (candidateNorm === requested.titleNormalized) {
    score += 60;
  } else if (candidateNorm.startsWith(requested.titleNormalized) || requested.titleNormalized.startsWith(candidateNorm)) {
    score += 40;
  } else if (candidateNorm.includes(requested.titleNormalized) || requested.titleNormalized.includes(candidateNorm)) {
    score += 25;
  } else {
    return -1; // not even substring-match — reject
  }

  // Year match.
  if (requested.year != null && candidate.year != null) {
    const diff = Math.abs(candidate.year - requested.year);
    if (diff === 0) score += 30;
    else if (diff === 1) score += 20;
    else if (diff <= 3) score += 5;
    else score -= 10; // more than 3 years off is suspicious — likely wrong film
  } else if (requested.year != null && candidate.year == null) {
    score -= 5;
  }

  // Tiebreaker: popularity (small contribution).
  score += Math.min(10, Math.log10(Math.max(1, candidate.popularity)) * 3);

  return score;
}

async function resolveOne(suggestion: SuggestedTitle): Promise<ResolvedTitle | null> {
  const titleNormalized = normalize(suggestion.title);
  if (titleNormalized.length === 0) return null;

  try {
    if (suggestion.mediaType === "tv") {
      const data = await searchShows(suggestion.title, 1);
      const candidates = (data.results ?? []).slice(0, 8);
      let best: { show: TMDBShow; score: number } | null = null;
      for (const s of candidates) {
        const score = scoreCandidate(
          { title: s.name, year: yearOf(s.first_air_date), popularity: s.popularity },
          { titleNormalized, year: suggestion.year },
        );
        if (score < 0) continue;
        if (!best || score > best.score) best = { show: s, score };
      }
      if (!best) return null;
      const s = best.show;
      return {
        tmdbId: s.id,
        title: s.name,
        posterPath: s.poster_path ?? null,
        releaseDate: s.first_air_date ?? null,
        voteAverage: s.vote_average ?? null,
        popularity: s.popularity,
        mediaType: "tv",
        genreIds: ((s as TMDBShow & { genre_ids?: number[] }).genre_ids) ?? [],
      };
    }
    const data = await searchMovies(suggestion.title, 1);
    const candidates = (data.results ?? []).slice(0, 8);
    let best: { movie: TMDBMovie; score: number } | null = null;
    for (const m of candidates) {
      const score = scoreCandidate(
        { title: m.title, year: yearOf(m.release_date), popularity: m.popularity },
        { titleNormalized, year: suggestion.year },
      );
      if (score < 0) continue;
      if (!best || score > best.score) best = { movie: m, score };
    }
    if (!best) return null;
    const m = best.movie;
    return {
      tmdbId: m.id,
      title: m.title,
      posterPath: m.poster_path ?? null,
      releaseDate: m.release_date ?? null,
      voteAverage: m.vote_average ?? null,
      popularity: m.popularity,
      mediaType: "movie",
      genreIds: ((m as TMDBMovie & { genre_ids?: number[] }).genre_ids) ?? [],
    };
  } catch {
    return null;
  }
}

/** Resolve a list of AI-suggested titles to TMDB ids in parallel. Order is
 *  preserved (caller's curation order matters — the AI ranked them). Failed
 *  resolutions are dropped silently; the caller's filter-fallback fills any
 *  gap. Dedupe handles cases where the AI suggested the same film twice
 *  (e.g. movie + tv variant) — first hit wins. */
export async function resolveTitles(suggestions: SuggestedTitle[]): Promise<ResolvedTitle[]> {
  if (suggestions.length === 0) return [];
  const resolved = await Promise.all(suggestions.map(resolveOne));
  const seen = new Set<string>();
  const out: ResolvedTitle[] = [];
  for (const r of resolved) {
    if (!r) continue;
    const key = `${r.mediaType}:${r.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
