/**
 * Cine-Q quiz generation logic.
 * Builds quiz questions from TMDB data with 5 phases of clues and 6 multiple-choice options.
 * Difficulty affects both the movie pool AND the clue phase order.
 */

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  tmdbId: number;
  answer: string;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  phases: string[][];
  options: string[];
}

interface TMDBMovieFull {
  id: number; title: string; overview: string; release_date: string; runtime?: number;
  vote_average: number; popularity: number; poster_path: string | null;
  original_language?: string; tagline?: string; budget?: number; revenue?: number;
  belongs_to_collection?: { name: string } | null;
  genres?: { id: number; name: string }[];
  credits?: { cast: { name: string; order: number }[]; crew: { name: string; job: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
}

interface TMDBShowFull {
  id: number; name: string; overview: string; first_air_date: string; last_air_date?: string;
  status?: string; number_of_seasons?: number; number_of_episodes?: number;
  episode_run_time?: number[]; vote_average: number; popularity: number; poster_path: string | null;
  original_language?: string; tagline?: string;
  genres?: { id: number; name: string }[];
  networks?: { name: string }[];
  created_by?: { name: string }[];
  aggregate_credits?: { cast: { name: string; order: number }[]; crew: { name: string; jobs: { job: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
}

// ─── Difficulty pools ────────────────────────────────────────────────────────
// Each difficulty fetches from different tiers and mixes them.
// "Popular" = high vote count + high popularity (blockbusters, well-known)
// "Known" = decent vote count, moderate popularity (recognizable but not top-of-mind)
// "Lesser known" = lower vote count, still English-language, still recognizable

interface TierConfig {
  voteMin: number;
  voteMax?: number;
  popSort: string;
  pages: number[];       // which TMDB pages to pull from
  language?: string;     // restrict to English to avoid obscure foreign films
}

function getTiers(difficulty: string): { tier: TierConfig; count: number }[] {
  if (difficulty === "easy") {
    return [
      // 80% popular/top-rated
      { tier: { voteMin: 3000, popSort: "popularity.desc", pages: [1, 2, 3, 4, 5] }, count: 8 },
      // 20% moderately known
      { tier: { voteMin: 1000, voteMax: 3000, popSort: "vote_average.desc", pages: [1, 2, 3], language: "en" }, count: 2 },
    ];
  } else if (difficulty === "hard") {
    return [
      // 20% popular
      { tier: { voteMin: 3000, popSort: "popularity.desc", pages: [3, 4, 5, 6, 7] }, count: 2 },
      // 40% somewhat known
      { tier: { voteMin: 500, voteMax: 2000, popSort: "vote_average.desc", pages: [1, 2, 3, 4], language: "en" }, count: 4 },
      // 40% lesser known (but still English, still reviewed)
      { tier: { voteMin: 200, voteMax: 500, popSort: "vote_average.desc", pages: [1, 2, 3], language: "en" }, count: 4 },
    ];
  } else {
    // Medium: 50/50
    return [
      // 50% popular
      { tier: { voteMin: 2000, popSort: "popularity.desc", pages: [1, 2, 3, 4, 5] }, count: 5 },
      // 50% moderately known
      { tier: { voteMin: 500, voteMax: 2000, popSort: "vote_average.desc", pages: [1, 2, 3, 4], language: "en" }, count: 5 },
    ];
  }
}

// ─── TMDB fetchers ───────────────────────────────────────────────────────────

async function fetchFromTier(
  type: "movie" | "tv",
  tier: TierConfig,
  count: number
): Promise<(TMDBMovieFull | TMDBShowFull)[]> {
  const endpoint = type === "movie" ? "discover/movie" : "discover/tv";
  const voteMax = tier.voteMax ? `&vote_count.lte=${tier.voteMax}` : "";
  const langParam = tier.language ? `&with_original_language=${tier.language}` : "";

  const pages = await Promise.all(
    tier.pages.map((p) =>
      fetch(`${BASE}/${endpoint}?api_key=${API_KEY}&sort_by=${tier.popSort}&vote_count.gte=${tier.voteMin}${voteMax}${langParam}&page=${p}&include_adult=false`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
        .catch(() => ({ results: [] }))
    )
  );

  const pool = pages.flatMap((p) => p.results ?? []);
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count + 5);

  const appendParam = type === "movie" ? "credits,release_dates" : "aggregate_credits,content_ratings";
  const detailed = await Promise.all(
    shuffled.map((item: { id: number }) =>
      fetch(`${BASE}/${type === "movie" ? "movie" : "tv"}/${item.id}?api_key=${API_KEY}&append_to_response=${appendParam}`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
        .catch(() => null)
    )
  );

  return detailed.filter(Boolean).slice(0, count);
}

async function fetchMoviePool(difficulty: string, count: number): Promise<TMDBMovieFull[]> {
  const tiers = getTiers(difficulty);
  const results: TMDBMovieFull[] = [];
  for (const { tier, count: tierCount } of tiers) {
    const movies = await fetchFromTier("movie", tier, tierCount) as TMDBMovieFull[];
    results.push(...movies);
  }
  return results.sort(() => Math.random() - 0.5).slice(0, count);
}

async function fetchShowPool(difficulty: string, count: number): Promise<TMDBShowFull[]> {
  const tiers = getTiers(difficulty);
  const results: TMDBShowFull[] = [];
  for (const { tier, count: tierCount } of tiers) {
    const shows = await fetchFromTier("tv", tier, tierCount) as TMDBShowFull[];
    results.push(...shows);
  }
  return results.sort(() => Math.random() - 0.5).slice(0, count);
}

// ─── Clue helpers ────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", ja: "Japanese",
  ko: "Korean", zh: "Chinese", hi: "Hindi", it: "Italian", pt: "Portuguese",
  ru: "Russian", ar: "Arabic", th: "Thai", sv: "Swedish", nl: "Dutch",
};

function getMpaaRating(movie: TMDBMovieFull): string | null {
  const us = movie.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
  return us?.release_dates?.find((d) => d.certification)?.certification || null;
}

function getTvRating(show: TMDBShowFull): string | null {
  const us = show.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
  return us?.rating || null;
}

function formatRevenue(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function buildBonusClues(movie: TMDBMovieFull, cast: string[]): string[] {
  const bonuses: string[] = [];
  if (movie.tagline) bonuses.push(`Tagline: "${movie.tagline}"`);
  if (movie.revenue && movie.revenue > 0) bonuses.push(`Box office: ${formatRevenue(movie.revenue)}`);
  if (movie.belongs_to_collection) bonuses.push(`Part of the ${movie.belongs_to_collection.name}`);
  if (movie.original_language && movie.original_language !== "en") bonuses.push(`Original language: ${LANG_NAMES[movie.original_language] ?? movie.original_language}`);
  if (movie.budget && movie.budget > 0) bonuses.push(`Budget: ${formatRevenue(movie.budget)}`);
  if (cast[2]) bonuses.push(`Also features ${cast[2]}`);
  return bonuses.sort(() => Math.random() - 0.5);
}

// ─── Movie clue builders (difficulty-aware) ──────────────────────────────────

function buildMovieClues(movie: TMDBMovieFull, difficulty: string): string[][] {
  const year = movie.release_date?.slice(0, 4) ?? "Unknown year";
  const genres = movie.genres?.map((g) => g.name).join(", ") ?? "Unknown genre";
  const mpa = getMpaaRating(movie);
  const director = movie.credits?.crew?.find((c) => c.job === "Director")?.name ?? "Unknown";
  const cast = movie.credits?.cast?.sort((a, b) => a.order - b.order).slice(0, 3).map((c) => c.name) ?? [];
  const overview = movie.overview?.slice(0, 200) ?? "No description available";
  const overviewClue = overview + (movie.overview && movie.overview.length > 200 ? "…" : "");
  const bonuses = buildBonusClues(movie, cast);
  const bonusClue = bonuses[0] ?? "No additional clues";

  if (difficulty === "easy") {
    // Easy: Year+Director → Lead actor+Genre → Rating+Supporting → Bonus → Overview
    return [
      [`Released in ${year}`, `Directed by ${director}`],
      [cast[0] ? `Starring ${cast[0]}` : "Unknown lead", `Genre: ${genres}`],
      [mpa ? `Rated ${mpa}` : "Rating unavailable", cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [bonuses[0] ?? bonusClue, bonuses[1] ?? ""].filter(Boolean),
      [overviewClue],
    ];
  } else if (difficulty === "hard") {
    // Hard: Genre+Rating → Year → Supporting actor → Director+Lead actor → Bonus (no overview)
    return [
      [`Genre: ${genres}`, mpa ? `Rated ${mpa}` : "Rating unavailable"],
      [`Released in ${year}`],
      [cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [`Directed by ${director}`, cast[0] ? `Starring ${cast[0]}` : "Unknown lead"],
      [bonuses[0] ?? bonusClue],
    ];
  } else {
    // Medium: Genre+Director → Year+Supporting → Rating+Lead actor → Bonus → Overview
    return [
      [`Genre: ${genres}`, `Directed by ${director}`],
      [`Released in ${year}`, cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [mpa ? `Rated ${mpa}` : "Rating unavailable", cast[0] ? `Starring ${cast[0]}` : "Unknown lead"],
      [bonuses[0] ?? bonusClue, bonuses[1] ?? ""].filter(Boolean),
      [overviewClue],
    ];
  }
}

// ─── TV show clue builders (difficulty-aware) ────────────────────────────────

function buildShowClues(show: TMDBShowFull, difficulty: string): string[][] {
  const startYear = show.first_air_date?.slice(0, 4) ?? "Unknown";
  const endYear = show.status === "Ended" || show.status === "Canceled" ? show.last_air_date?.slice(0, 4) ?? "Unknown" : "Present";
  const yearSpan = startYear === endYear ? startYear : `${startYear}–${endYear}`;
  const genres = show.genres?.map((g) => g.name).join(", ") ?? "Unknown genre";
  const tvRating = getTvRating(show);
  const creator = show.created_by?.[0]?.name ?? "Unknown";
  const cast = show.aggregate_credits?.cast?.sort((a, b) => a.order - b.order).slice(0, 3).map((c) => c.name) ?? [];
  const network = show.networks?.[0]?.name;
  const overview = show.overview?.slice(0, 200) ?? "No description available";
  const overviewClue = overview + (show.overview && show.overview.length > 200 ? "…" : "");

  const bonuses: string[] = [];
  if (show.tagline) bonuses.push(`Tagline: "${show.tagline}"`);
  if (show.original_language && show.original_language !== "en") bonuses.push(`Original language: ${LANG_NAMES[show.original_language] ?? show.original_language}`);
  if (network) bonuses.push(`Network: ${network}`);
  if (show.number_of_seasons) bonuses.push(`${show.number_of_seasons} season${show.number_of_seasons !== 1 ? "s" : ""}`);
  if (cast[2]) bonuses.push(`Also features ${cast[2]}`);
  const shuffledBonuses = bonuses.sort(() => Math.random() - 0.5);
  const bonusClue = shuffledBonuses[0] ?? "No additional clues";

  if (difficulty === "easy") {
    return [
      [`Aired: ${yearSpan}`, `Created by ${creator}`],
      [cast[0] ? `Starring ${cast[0]}` : "Unknown lead", `Genre: ${genres}`],
      [tvRating ? `Rated ${tvRating}` : "Rating unavailable", cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [shuffledBonuses[0] ?? bonusClue, shuffledBonuses[1] ?? ""].filter(Boolean),
      [overviewClue],
    ];
  } else if (difficulty === "hard") {
    return [
      [`Genre: ${genres}`, tvRating ? `Rated ${tvRating}` : "Rating unavailable"],
      [`Aired: ${yearSpan}`],
      [cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [`Created by ${creator}`, cast[0] ? `Starring ${cast[0]}` : "Unknown lead"],
      [shuffledBonuses[0] ?? bonusClue],
    ];
  } else {
    return [
      [`Genre: ${genres}`, `Created by ${creator}`],
      [`Aired: ${yearSpan}`, cast[1] ? `Also starring ${cast[1]}` : bonusClue],
      [tvRating ? `Rated ${tvRating}` : "Rating unavailable", cast[0] ? `Starring ${cast[0]}` : "Unknown lead"],
      [shuffledBonuses[0] ?? bonusClue, shuffledBonuses[1] ?? ""].filter(Boolean),
      [overviewClue],
    ];
  }
}

// ─── Distractor generation ───────────────────────────────────────────────────

async function fetchDistractors(mediaType: "movie" | "tv", correctTitle: string, genreIds: number[], year: string, count: number): Promise<string[]> {
  const yearNum = parseInt(year, 10) || 2020;
  const genreParam = genreIds.slice(0, 2).join("|");
  const endpoint = mediaType === "movie" ? "discover/movie" : "discover/tv";
  const dateKey = mediaType === "movie" ? "primary_release_date" : "first_air_date";

  try {
    const res = await fetch(
      `${BASE}/${endpoint}?api_key=${API_KEY}&with_genres=${genreParam}&${dateKey}.gte=${yearNum - 5}-01-01&${dateKey}.lte=${yearNum + 5}-12-31&sort_by=popularity.desc&vote_count.gte=100&page=1`,
      { next: { revalidate: 86400 } }
    );
    const data = await res.json();
    return (data.results ?? [])
      .map((r: { title?: string; name?: string }) => r.title ?? r.name)
      .filter((t: string) => t && t !== correctTitle)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  } catch {
    return [];
  }
}

// ─── Main quiz generator ─────────────────────────────────────────────────────

export async function generateQuiz(mediaType: "movie" | "tv" | "both", difficulty: string): Promise<QuizQuestion[]> {
  let movieCount = 0, showCount = 0;
  if (mediaType === "movie") movieCount = 10;
  else if (mediaType === "tv") showCount = 10;
  else { movieCount = 5; showCount = 5; }

  const [movies, shows] = await Promise.all([
    movieCount > 0 ? fetchMoviePool(difficulty, movieCount + 5) : Promise.resolve([]),
    showCount > 0 ? fetchShowPool(difficulty, showCount + 5) : Promise.resolve([]),
  ]);

  const questions: QuizQuestion[] = [];

  for (const movie of movies.slice(0, movieCount)) {
    if (!movie.title || !movie.release_date) continue;
    const clues = buildMovieClues(movie, difficulty);
    const genreIds = movie.genres?.map((g) => g.id) ?? [];
    const distractors = await fetchDistractors("movie", movie.title, genreIds, movie.release_date.slice(0, 4), 5);
    if (distractors.length < 5) continue;
    questions.push({
      tmdbId: movie.id, answer: movie.title, mediaType: "movie", posterPath: movie.poster_path,
      phases: clues, options: [movie.title, ...distractors].sort(() => Math.random() - 0.5),
    });
  }

  for (const show of shows.slice(0, showCount)) {
    if (!show.name || !show.first_air_date) continue;
    const clues = buildShowClues(show, difficulty);
    const genreIds = show.genres?.map((g) => g.id) ?? [];
    const distractors = await fetchDistractors("tv", show.name, genreIds, show.first_air_date.slice(0, 4), 5);
    if (distractors.length < 5) continue;
    questions.push({
      tmdbId: show.id, answer: show.name, mediaType: "tv", posterPath: show.poster_path,
      phases: clues, options: [show.name, ...distractors].sort(() => Math.random() - 0.5),
    });
  }

  return questions.slice(0, 10);
}

// ─── Date helper (Pacific time) ──────────────────────────────────────────────

export function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
