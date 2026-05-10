/**
 * Cinephile-type classifier used by the Year-in-Review page.
 *
 * Algorithmic (no AI). Priority-ordered: the most distinctive
 * archetype wins, so a Genre Specialist isn't demoted to a generic
 * "Generous Rater" just because their average is high.
 *
 * Inputs are normalized stats — Prisma-free — so this is unit-testable
 * and reusable from other surfaces if we ever need to (analytics page,
 * profile badge, etc.).
 */

export interface CinephileTypeInputs {
  /** Movies + show-series-level watches (does NOT count individual episodes). */
  totalTitles: number;
  movieCount: number;
  showCount: number;
  episodeCount: number;
  ratedCount: number;
  avgRating: number | null;
  ratingStdDev: number | null;
  /** Genre name → watch count, blended across movies + shows. */
  genreMix: Map<string, number>;
  /** "1970s" | "1980s" | ... → count. */
  decadeMix: Map<string, number>;
  /** Count of the most-watched director's titles. 0 if no clear leader. */
  topPersonCount: number;
  /** Average movie runtime in minutes, null if no movie data. */
  avgMovieRuntime: number | null;
  /** Average of the 5 weighted category scores. Nulls allowed. */
  categoryAvgs: {
    story: number | null;
    style: number | null;
    emotive: number | null;
    acting: number | null;
    entertain: number | null;
  };
}

export interface CinephileType {
  archetype: string;
  tagline: string;
}

/**
 * Returns the single best-fitting cinephile archetype for the year.
 * Priority-ordered cascade — first rule that matches wins.
 */
export function cinephileType(inputs: CinephileTypeInputs): CinephileType {
  const {
    totalTitles, movieCount, showCount, episodeCount, ratedCount,
    avgRating, ratingStdDev, genreMix, decadeMix, topPersonCount,
    avgMovieRuntime, categoryAvgs,
  } = inputs;

  const safeTotal = Math.max(totalTitles, 1);

  // ── Volume extremes ──────────────────────────────────────────────
  if (totalTitles >= 200) {
    return {
      archetype: "The Marathoner",
      tagline: `${totalTitles} titles in one year. Sleep is optional, apparently.`,
    };
  }
  if (totalTitles >= 5 && totalTitles <= 20 && (avgRating ?? 0) >= 7.5) {
    return {
      archetype: "The Curator",
      tagline: "Few films, high standards. Every pick a deliberate choice.",
    };
  }

  // ── Media split extremes ─────────────────────────────────────────
  const moviePct = movieCount / safeTotal;
  const showPct = showCount / safeTotal;
  if (showCount >= 5 && showPct >= 0.7) {
    return {
      archetype: "The TV Devotee",
      tagline: `${episodeCount} episodes deep. The small screen is where the great stories live.`,
    };
  }
  if (movieCount >= 20 && moviePct >= 0.95) {
    return {
      archetype: "The Pure Cinephile",
      tagline: "All movies, all year. No filler, no episodes — just feature films.",
    };
  }

  // ── Genre dominance ──────────────────────────────────────────────
  const genreTotal = [...genreMix.values()].reduce((s, v) => s + v, 0);
  if (genreTotal >= 10) {
    const sortedGenres = [...genreMix.entries()].sort((a, b) => b[1] - a[1]);
    const [topGenre, topGenreCount] = sortedGenres[0];
    if (topGenreCount / genreTotal >= 0.5) {
      return {
        archetype: `The ${topGenre} Specialist`,
        tagline: `Over half your year was ${topGenre.toLowerCase()}. That's commitment.`,
      };
    }
  }

  // ── Person loyalty ───────────────────────────────────────────────
  if (topPersonCount >= 8) {
    return {
      archetype: "The Auteur Follower",
      tagline: `Followed one filmmaker through ${topPersonCount} titles. That's a deep dive.`,
    };
  }

  // ── Runtime extremes (movies only — shows don't fit this axis) ──
  if (movieCount >= 10 && avgMovieRuntime != null) {
    if (avgMovieRuntime >= 140) {
      return {
        archetype: "The Epic Devotee",
        tagline: `Average runtime: ${Math.round(avgMovieRuntime)} minutes. You don't fear the long sit.`,
      };
    }
    if (avgMovieRuntime <= 95) {
      return {
        archetype: "The Lean-Cut Watcher",
        tagline: `Average runtime: ${Math.round(avgMovieRuntime)} minutes. In and out, no bloat.`,
      };
    }
  }

  // ── Category preference (top weighted category clearly ahead) ────
  if (ratedCount >= 5) {
    const cats: { label: keyof typeof categoryAvgs; archetype: string; tagline: string }[] = [
      { label: "story",     archetype: "The Story Hound",       tagline: "Plot, pacing, character — you watch for the writing." },
      { label: "style",     archetype: "The Style Junkie",      tagline: "Cinematography, sound, craft. The how matters as much as the what." },
      { label: "emotive",   archetype: "The Slow-Burn Romantic",tagline: "Meaning, movingness, weight. You want films that stay with you." },
      { label: "acting",    archetype: "The Performance Hunter",tagline: "Casting, dialogue, the actor's choices. You're here for the work." },
      { label: "entertain", archetype: "The Pure-Fun Watcher",  tagline: "Appeal, energy, spectacle. Cinema as entertainment — no apologies." },
    ];
    const ranked = cats
      .map((c) => ({ ...c, score: categoryAvgs[c.label] }))
      .filter((c): c is typeof c & { score: number } => c.score != null)
      .sort((a, b) => b.score - a.score);
    if (ranked.length >= 2 && ranked[0].score - ranked[1].score >= 0.5) {
      return { archetype: ranked[0].archetype, tagline: ranked[0].tagline };
    }
  }

  // ── Rating temperament ───────────────────────────────────────────
  if (ratedCount >= 3 && avgRating != null) {
    if (avgRating <= 5) {
      return {
        archetype: "The Tough Critic",
        tagline: `Average rating: ${avgRating.toFixed(1)}. The bar is high and movies have to clear it.`,
      };
    }
    if (avgRating >= 7.5) {
      return {
        archetype: "The Generous Rater",
        tagline: `Average rating: ${avgRating.toFixed(1)}. You find something to love in almost anything.`,
      };
    }
    if ((ratingStdDev ?? 0) >= 2) {
      return {
        archetype: "The Polarized Watcher",
        tagline: "No mids in your diary. Films are either incredible or unforgivable.",
      };
    }
  }

  // ── Era preference ───────────────────────────────────────────────
  const decadeTotal = [...decadeMix.values()].reduce((s, v) => s + v, 0);
  if (decadeTotal >= 10) {
    const recentCount = (decadeMix.get("2020s") ?? 0) + (decadeMix.get("2010s") ?? 0);
    const classicCount = [...decadeMix.entries()]
      .filter(([d]) => d < "2000s")
      .reduce((s, [, n]) => s + n, 0);
    if (recentCount / decadeTotal > 0.8) {
      return {
        archetype: "The Modern Movie Fan",
        tagline: "This decade, that decade — but mostly this one. New releases get your time.",
      };
    }
    if (classicCount / decadeTotal > 0.3) {
      return {
        archetype: "The Classic Film Buff",
        tagline: "The vault is open. You spend your year in cinema's deep catalog.",
      };
    }
    if (decadeMix.size >= 6) {
      return {
        archetype: "The Era-Spanning Cinephile",
        tagline: `Watched across ${decadeMix.size} decades. Time travel, one feature at a time.`,
      };
    }
  }

  // ── Genre diversity (no dominance, breadth instead) ──────────────
  if (genreTotal >= 15 && genreMix.size >= 8) {
    return {
      archetype: "The Genre-Hopper",
      tagline: `${genreMix.size} different genres this year. No two films alike.`,
    };
  }

  // ── Default ──────────────────────────────────────────────────────
  return {
    archetype: "The Film Explorer",
    tagline: "Building your taste, one watch at a time.",
  };
}
