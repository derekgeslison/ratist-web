/**
 * Cine-Q quiz generation logic.
 * Builds quiz questions from TMDB data with 5 phases of clues and 6 multiple-choice options.
 */

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  tmdbId: number;
  answer: string;          // correct title
  mediaType: "movie" | "tv";
  posterPath: string | null;
  phases: string[][];      // 5 phases, each an array of clue strings
  options: string[];       // 6 options (shuffled, includes answer)
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

// ─── Difficulty thresholds ───────────────────────────────────────────────────

const POPULARITY_THRESHOLDS = {
  easy: 50,    // very popular
  medium: 20,  // moderately popular
  hard: 5,     // less well-known
};

const VOTE_COUNT_MIN = {
  easy: 2000,
  medium: 500,
  hard: 100,
};

// ─── TMDB fetchers ───────────────────────────────────────────────────────────

async function fetchMoviePool(difficulty: string, count: number): Promise<TMDBMovieFull[]> {
  const minVotes = VOTE_COUNT_MIN[difficulty as keyof typeof VOTE_COUNT_MIN] ?? 500;
  const minPop = POPULARITY_THRESHOLDS[difficulty as keyof typeof POPULARITY_THRESHOLDS] ?? 20;

  // Fetch several pages to get a good pool
  const pages = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      fetch(`${BASE}/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=${minVotes}&page=${i + 1}&include_adult=false`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
    )
  );
  const pool = pages.flatMap((p) => p.results ?? [])
    .filter((m: { popularity: number }) => difficulty === "hard" ? m.popularity < minPop * 3 : m.popularity >= minPop);

  // Shuffle and pick
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count * 2);

  // Fetch full details for selected movies
  const detailed = await Promise.all(
    shuffled.slice(0, count).map((m: { id: number }) =>
      fetch(`${BASE}/movie/${m.id}?api_key=${API_KEY}&append_to_response=credits,release_dates`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
        .catch(() => null)
    )
  );

  return detailed.filter(Boolean) as TMDBMovieFull[];
}

async function fetchShowPool(difficulty: string, count: number): Promise<TMDBShowFull[]> {
  const minVotes = VOTE_COUNT_MIN[difficulty as keyof typeof VOTE_COUNT_MIN] ?? 500;
  const minPop = POPULARITY_THRESHOLDS[difficulty as keyof typeof POPULARITY_THRESHOLDS] ?? 20;

  const pages = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      fetch(`${BASE}/discover/tv?api_key=${API_KEY}&sort_by=popularity.desc&vote_count.gte=${minVotes}&page=${i + 1}&include_adult=false`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
    )
  );
  const pool = pages.flatMap((p) => p.results ?? [])
    .filter((s: { popularity: number }) => difficulty === "hard" ? s.popularity < minPop * 3 : s.popularity >= minPop);

  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count * 2);

  const detailed = await Promise.all(
    shuffled.slice(0, count).map((s: { id: number }) =>
      fetch(`${BASE}/tv/${s.id}?api_key=${API_KEY}&append_to_response=aggregate_credits,content_ratings`, { next: { revalidate: 86400 } })
        .then((r) => r.json())
        .catch(() => null)
    )
  );

  return detailed.filter(Boolean) as TMDBShowFull[];
}

// ─── Clue builders ───────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", ja: "Japanese",
  ko: "Korean", zh: "Chinese", hi: "Hindi", it: "Italian", pt: "Portuguese",
  ru: "Russian", ar: "Arabic", th: "Thai", sv: "Swedish", nl: "Dutch", pl: "Polish", tr: "Turkish",
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

function buildMovieClues(movie: TMDBMovieFull, difficulty: string): string[][] {
  const year = movie.release_date?.slice(0, 4) ?? "Unknown year";
  const decade = year !== "Unknown year" ? `${year.slice(0, 3)}0s` : "Unknown";
  const genres = movie.genres?.map((g) => g.name).join(", ") ?? "Unknown genre";
  const mpa = getMpaaRating(movie);
  const director = movie.credits?.crew?.find((c) => c.job === "Director")?.name;
  const cast = movie.credits?.cast?.sort((a, b) => a.order - b.order).slice(0, 3).map((c) => c.name) ?? [];
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : null;
  const rating = movie.vote_average > 0 ? movie.vote_average.toFixed(1) : null;
  const overview = movie.overview?.slice(0, 200) ?? "No description available";
  const overviewClue = overview + (movie.overview && movie.overview.length > 200 ? "…" : "");

  // Build bonus pool
  const bonuses: string[] = [];
  if (movie.tagline) bonuses.push(`Tagline: "${movie.tagline}"`);
  if (movie.revenue && movie.revenue > 0) bonuses.push(`Box office: ${formatRevenue(movie.revenue)}`);
  if (movie.belongs_to_collection) bonuses.push(`Part of the ${movie.belongs_to_collection.name}`);
  if (movie.original_language && movie.original_language !== "en") bonuses.push(`Original language: ${LANG_NAMES[movie.original_language] ?? movie.original_language}`);
  if (movie.budget && movie.budget > 0) bonuses.push(`Budget: ${formatRevenue(movie.budget)}`);
  const bonus = bonuses.sort(() => Math.random() - 0.5)[0] ?? (cast[2] ? `Also features ${cast[2]}` : null);

  if (difficulty === "easy") {
    // Easy: identifiable info early (actor → director → year → bonus → overview)
    const p1: string[] = [];
    if (cast[0]) p1.push(`Starring ${cast[0]}`);
    p1.push(`Genre: ${genres}`);

    const p2: string[] = [];
    if (director) p2.push(`Directed by ${director}`);
    if (mpa) p2.push(`Rated ${mpa}`);

    const p3: string[] = [`Released in ${year}`];
    if (runtime) p3.push(`Runtime: ${runtime}`);
    if (rating) p3.push(`TMDB Rating: ${rating}/10`);

    const p4: string[] = [];
    if (cast[1]) p4.push(`Also starring ${cast[1]}`);
    if (bonus) p4.push(bonus);
    if (p4.length === 0) p4.push(`Released in ${year}`);

    return [p1, p2, p3, p4, [overviewClue]];

  } else if (difficulty === "hard") {
    // Hard: vaguest info first, actors/directors withheld until late
    const p1: string[] = [`Genre: ${genres}`];

    const p2: string[] = [`Released in the ${decade}`];
    if (mpa) p2.push(`Rated ${mpa}`);

    const p3: string[] = [];
    if (runtime) p3.push(`Runtime: ${runtime}`);
    if (rating) p3.push(`TMDB Rating: ${rating}/10`);
    if (bonus) p3.push(bonus);

    const p4: string[] = [];
    if (cast[0]) p4.push(`Starring ${cast[0]}`);
    if (director) p4.push(`Directed by ${director}`);

    return [p1, p2, p3, p4, [overviewClue]];

  } else {
    // Medium: balanced (genre → decade+runtime → actor → director+bonus → overview)
    const p1: string[] = [`Genre: ${genres}`];
    if (mpa) p1.push(`Rated ${mpa}`);

    const p2: string[] = [`Released in the ${decade}`];
    if (runtime) p2.push(`Runtime: ${runtime}`);

    const p3: string[] = [];
    if (cast[0]) p3.push(`Starring ${cast[0]}`);
    if (rating) p3.push(`TMDB Rating: ${rating}/10`);

    const p4: string[] = [];
    if (director) p4.push(`Directed by ${director}`);
    if (bonus) p4.push(bonus);

    return [p1, p2, p3, p4, [overviewClue]];
  }
}

function buildShowClues(show: TMDBShowFull, difficulty: string): string[][] {
  const startYear = show.first_air_date?.slice(0, 4) ?? "Unknown";
  const startDecade = startYear !== "Unknown" ? `${startYear.slice(0, 3)}0s` : "Unknown";
  const endYear = show.status === "Ended" || show.status === "Canceled"
    ? show.last_air_date?.slice(0, 4) ?? "Unknown"
    : "Present";
  const yearSpan = startYear === endYear ? startYear : `${startYear}–${endYear}`;
  const genres = show.genres?.map((g) => g.name).join(", ") ?? "Unknown genre";
  const tvRating = getTvRating(show);
  const creator = show.created_by?.[0]?.name;
  const cast = show.aggregate_credits?.cast?.sort((a, b) => a.order - b.order).slice(0, 3).map((c) => c.name) ?? [];
  const network = show.networks?.[0]?.name;
  const rating = show.vote_average > 0 ? show.vote_average.toFixed(1) : null;
  const overview = show.overview?.slice(0, 200) ?? "No description available";
  const overviewClue = overview + (show.overview && show.overview.length > 200 ? "…" : "");

  const bonuses: string[] = [];
  if (show.tagline) bonuses.push(`Tagline: "${show.tagline}"`);
  if (show.original_language && show.original_language !== "en") bonuses.push(`Original language: ${LANG_NAMES[show.original_language] ?? show.original_language}`);
  if (cast[2]) bonuses.push(`Also features ${cast[2]}`);
  const bonus = bonuses.sort(() => Math.random() - 0.5)[0] ?? null;

  if (difficulty === "easy") {
    const p1: string[] = [];
    if (cast[0]) p1.push(`Starring ${cast[0]}`);
    p1.push(`Genre: ${genres}`);

    const p2: string[] = [];
    if (creator) p2.push(`Created by ${creator}`);
    if (network) p2.push(`Network: ${network}`);

    const p3: string[] = [`Aired: ${yearSpan}`];
    if (show.number_of_seasons) p3.push(`${show.number_of_seasons} season${show.number_of_seasons !== 1 ? "s" : ""}`);
    if (rating) p3.push(`TMDB Rating: ${rating}/10`);

    const p4: string[] = [];
    if (cast[1]) p4.push(`Also starring ${cast[1]}`);
    if (bonus) p4.push(bonus);
    if (tvRating) p4.push(`Rated ${tvRating}`);
    if (p4.length === 0) p4.push(`${show.number_of_episodes ?? "?"} episodes`);

    return [p1, p2, p3, p4, [overviewClue]];

  } else if (difficulty === "hard") {
    const p1: string[] = [`Genre: ${genres}`];

    const p2: string[] = [`Started in the ${startDecade}`];
    if (tvRating) p2.push(`Rated ${tvRating}`);

    const p3: string[] = [];
    if (show.number_of_seasons) p3.push(`${show.number_of_seasons} season${show.number_of_seasons !== 1 ? "s" : ""}`);
    if (rating) p3.push(`TMDB Rating: ${rating}/10`);
    if (network) p3.push(`Network: ${network}`);

    const p4: string[] = [];
    if (cast[0]) p4.push(`Starring ${cast[0]}`);
    if (creator) p4.push(`Created by ${creator}`);

    return [p1, p2, p3, p4, [overviewClue]];

  } else {
    const p1: string[] = [`Genre: ${genres}`];
    if (tvRating) p1.push(`Rated ${tvRating}`);

    const p2: string[] = [`Started in the ${startDecade}`];
    if (show.number_of_seasons) p2.push(`${show.number_of_seasons} season${show.number_of_seasons !== 1 ? "s" : ""}`);

    const p3: string[] = [];
    if (cast[0]) p3.push(`Starring ${cast[0]}`);
    if (network) p3.push(`Network: ${network}`);

    const p4: string[] = [];
    if (creator) p4.push(`Created by ${creator}`);
    if (bonus) p4.push(bonus);
    if (rating) p4.push(`TMDB Rating: ${rating}/10`);

    return [p1, p2, p3, p4, [overviewClue]];
  }
}

// ─── Distractor generation ───────────────────────────────────────────────────

async function fetchDistractors(
  mediaType: "movie" | "tv",
  correctTitle: string,
  genreIds: number[],
  year: string,
  count: number
): Promise<string[]> {
  const yearNum = parseInt(year, 10) || 2020;
  const genreParam = genreIds.slice(0, 2).join("|");
  const endpoint = mediaType === "movie" ? "discover/movie" : "discover/tv";
  const dateParam = mediaType === "movie"
    ? `&primary_release_date.gte=${yearNum - 5}-01-01&primary_release_date.lte=${yearNum + 5}-12-31`
    : `&first_air_date.gte=${yearNum - 5}-01-01&first_air_date.lte=${yearNum + 5}-12-31`;

  try {
    const res = await fetch(
      `${BASE}/${endpoint}?api_key=${API_KEY}&with_genres=${genreParam}${dateParam}&sort_by=popularity.desc&vote_count.gte=100&page=1`,
      { next: { revalidate: 86400 } }
    );
    const data = await res.json();
    const titles = (data.results ?? [])
      .map((r: { title?: string; name?: string }) => r.title ?? r.name)
      .filter((t: string) => t && t !== correctTitle);
    // Shuffle and pick
    return titles.sort(() => Math.random() - 0.5).slice(0, count);
  } catch {
    return [];
  }
}

// ─── Main quiz generator ─────────────────────────────────────────────────────

export async function generateQuiz(
  mediaType: "movie" | "tv" | "both",
  difficulty: string
): Promise<QuizQuestion[]> {
  let movieCount = 0;
  let showCount = 0;

  if (mediaType === "movie") movieCount = 10;
  else if (mediaType === "tv") showCount = 10;
  else { movieCount = 5; showCount = 5; }

  const [movies, shows] = await Promise.all([
    movieCount > 0 ? fetchMoviePool(difficulty, movieCount + 3) : Promise.resolve([]),
    showCount > 0 ? fetchShowPool(difficulty, showCount + 3) : Promise.resolve([]),
  ]);

  const questions: QuizQuestion[] = [];

  // Build movie questions
  for (const movie of movies.slice(0, movieCount)) {
    if (!movie.title || !movie.release_date) continue;
    const clues = buildMovieClues(movie, difficulty);
    const genreIds = movie.genres?.map((g) => g.id) ?? [];
    const distractors = await fetchDistractors("movie", movie.title, genreIds, movie.release_date.slice(0, 4), 5);
    if (distractors.length < 5) continue; // skip if not enough options
    const options = [movie.title, ...distractors].sort(() => Math.random() - 0.5);

    questions.push({
      tmdbId: movie.id,
      answer: movie.title,
      mediaType: "movie",
      posterPath: movie.poster_path,
      phases: clues,
      options,
    });
  }

  // Build show questions
  for (const show of shows.slice(0, showCount)) {
    if (!show.name || !show.first_air_date) continue;
    const clues = buildShowClues(show, difficulty);
    const genreIds = show.genres?.map((g) => g.id) ?? [];
    const distractors = await fetchDistractors("tv", show.name, genreIds, show.first_air_date.slice(0, 4), 5);
    if (distractors.length < 5) continue;
    const options = [show.name, ...distractors].sort(() => Math.random() - 0.5);

    questions.push({
      tmdbId: show.id,
      answer: show.name,
      mediaType: show.first_air_date ? "tv" : "tv",
      posterPath: show.poster_path,
      phases: clues,
      options,
    });
  }

  // Trim to exact count needed
  const needed = mediaType === "both" ? 10 : 10;
  return questions.slice(0, needed);
}

// ─── Date helper (Pacific time) ──────────────────────────────────────────────

export function getPacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
