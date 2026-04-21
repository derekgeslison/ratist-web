// Expand hidden mood tags into genre adds / genre excludes so they shape
// TMDB discover results without showing up as UI filters. Used by both
// /api/tools/recommend and /api/tools/collections/ai.

import type { Mood } from "./recommend-filters";

// Genre names are canonical TMDB movie names. The routes map them to IDs.
interface MoodWeights {
  add: string[];      // add to genres (union with AI's pick)
  avoid: string[];    // add to excludeGenres
}

const MOOD_MAP: Record<Mood, MoodWeights> = {
  "feel-good": {
    add: ["Comedy", "Family"],
    avoid: ["Horror", "Thriller", "War", "Crime"],
  },
  "dark": {
    add: ["Drama", "Crime", "Thriller"],
    avoid: ["Comedy", "Family", "Animation", "Music"],
  },
  "scary": {
    // For TV the movie→TV mapper drops Horror (TV has no Horror genre).
    // The substitutes (Mystery + Sci-Fi & Fantasy) catch supernatural shows.
    add: ["Horror", "Mystery", "Science Fiction"],
    avoid: ["Comedy", "Family"],
  },
  "romantic": {
    // For TV the movie→TV mapper drops Romance. Drama + Comedy catch TV rom-coms.
    add: ["Romance", "Drama", "Comedy"],
    avoid: ["Horror", "Thriller"],
  },
  "tearjerker": {
    add: ["Drama", "Romance"],
    avoid: ["Comedy", "Action"],
  },
  "mind-bending": {
    add: ["Mystery", "Thriller", "Science Fiction"],
    avoid: ["Family", "Comedy"],
  },
  "thought-provoking": {
    add: ["Drama", "Documentary", "Mystery"],
    avoid: ["Family"],
  },
  "epic": {
    add: ["Adventure", "Action", "Fantasy", "History", "War"],
    avoid: [],
  },
  "inspiring": {
    add: ["Drama", "History"],
    avoid: ["Horror", "Thriller"],
  },
  "offbeat": {
    // No genre tweaks — the hint is tonal, handled by not over-constraining.
    add: [],
    avoid: [],
  },
  "funny": {
    add: ["Comedy"],
    avoid: [],
  },
  "edge-of-seat": {
    add: ["Thriller", "Action", "Mystery"],
    avoid: ["Family"],
  },
};

export function expandMoods(
  moods: Mood[],
  currentGenres: string[],
  currentExcludeGenres: string[],
): { genres: string[]; excludeGenres: string[] } {
  if (!moods?.length) return { genres: currentGenres, excludeGenres: currentExcludeGenres };
  const genreSet = new Set(currentGenres);
  const excludeSet = new Set(currentExcludeGenres);
  for (const mood of moods) {
    const w = MOOD_MAP[mood];
    if (!w) continue;
    for (const g of w.add) genreSet.add(g);
    for (const g of w.avoid) {
      // User-picked genres win — don't add to excludes if the user actually wants it.
      if (!genreSet.has(g)) excludeSet.add(g);
    }
  }
  return {
    genres: [...genreSet],
    excludeGenres: [...excludeSet],
  };
}
