/**
 * Group mode for /tools/recommend — score candidate movies/shows from
 * the combined taste of multiple group members, not just the requesting
 * user. Mirrors the inline matchScore math the solo path does, just run
 * per member and aggregated.
 *
 * Floor (worst-of-the-group) is the primary ranking signal because group
 * recommendation research consistently shows it beats average for movie-
 * night satisfaction — "nobody hates it" wins over "average is high but
 * one person scored a 3."
 *
 * Members without taste data (no profile, or all-zero genre prefs) are
 * still shown in perMember (with score: null) so the user can see who's
 * contributing and who's not, but they're excluded from floor + group
 * score aggregation. A no-data member otherwise drags floor to zero on
 * every candidate, which would break the feature.
 */

import { prisma } from "./prisma";

export const MAX_GROUP_SIZE = 5;

// Mirrors the keys used inline in app/api/tools/recommend/route.ts so
// solo + group scoring stay aligned. If a new genre pref column lands
// in UserProfile, both places need to learn about it.
const GENRE_PREF_KEYS: Record<string, string> = {
  genreAction: "Action", genreHorror: "Horror", genreDrama: "Drama",
  genreScifi: "Science Fiction", genreThriller: "Thriller", genreComedy: "Comedy",
  genreFantasy: "Fantasy", genreRomance: "Romance", genreDocumentary: "Documentary",
  genreFamily: "Family", genreHistorical: "History", genreMusical: "Music",
  genreCrime: "Crime", genreWestern: "Western", genreMystery: "Mystery",
  genreBookAdapt: "Adventure", genreFilmNoir: "Thriller", genreBiopic: "Drama",
};

export interface MemberPrefs {
  userId: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  genrePrefs: Map<string, number>;
  hasData: boolean;
  ratingCount: number;
}

export function buildGenrePrefs(profile: Record<string, unknown> | null): Map<string, number> {
  const prefs = new Map<string, number>();
  if (!profile) return prefs;
  for (const [key, genre] of Object.entries(GENRE_PREF_KEYS)) {
    const score = Number(profile[key]) || 0;
    if (score > 0) {
      const existing = prefs.get(genre) ?? 0;
      if (score > existing) prefs.set(genre, score);
    }
  }
  return prefs;
}

export function computeMatchScore(prefs: Map<string, number>, itemGenres: string[]): number | null {
  if (prefs.size === 0 || itemGenres.length === 0) return null;
  const scores = itemGenres.map((g) => prefs.get(g) ?? 0).filter((s) => s > 0);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Load each member's profile + rating count in one round trip. */
export async function loadGroupMembers(userIds: string[]): Promise<MemberPrefs[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      profile: true,
      _count: { select: { ratings: true } },
    },
  });
  return users.map((u) => {
    const prefs = buildGenrePrefs(u.profile as Record<string, unknown> | null);
    return {
      userId: u.id,
      firebaseUid: u.firebaseUid,
      name: u.name,
      avatarUrl: u.avatarUrl,
      genrePrefs: prefs,
      hasData: prefs.size > 0,
      ratingCount: u._count.ratings,
    };
  });
}

export interface PerMemberScore {
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  score: number | null;
}

export interface GroupScoreResult {
  floor: number | null;
  groupScore: number | null;
  perMember: PerMemberScore[];
}

/**
 * Compute group score for a single candidate. members already loaded by
 * loadGroupMembers; itemGenres are the candidate's genre tags.
 *
 * Aggregation:
 *   floor      = min(score) over members with hasData and score != null
 *   groupScore = round(0.6 * floor + 0.4 * mean) over the same set
 *
 * Both null when no member produced a usable score (no data OR no
 * genre overlap with the candidate).
 */
export function computeGroupScore(members: MemberPrefs[], itemGenres: string[]): GroupScoreResult {
  const perMember: PerMemberScore[] = members.map((m) => ({
    firebaseUid: m.firebaseUid,
    name: m.name,
    avatarUrl: m.avatarUrl,
    score: m.hasData ? computeMatchScore(m.genrePrefs, itemGenres) : null,
  }));

  const validScores = perMember
    .map((p) => p.score)
    .filter((s): s is number => typeof s === "number" && s > 0);

  if (validScores.length === 0) {
    return { floor: null, groupScore: null, perMember };
  }

  const floor = Math.min(...validScores);
  const mean = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  const groupScore = Math.round(0.6 * floor + 0.4 * mean);

  return { floor, groupScore, perMember };
}

/**
 * Union of (movie tmdbId, tv tmdbId) seen-or-rated by ANY group member.
 * Drives the "unseen by everyone" exclusion in group mode — same default
 * the solo path applies, scaled to multi-user.
 */
export async function loadGroupSeenSets(userIds: string[]): Promise<{ movieTmdbIds: Set<number>; tvTmdbIds: Set<number> }> {
  if (userIds.length === 0) return { movieTmdbIds: new Set(), tvTmdbIds: new Set() };
  const [seenMovies, ratedMovies, seenShows, ratedShows] = await Promise.all([
    prisma.userFavoriteMovie.findMany({ where: { userId: { in: userIds } }, select: { movie: { select: { tmdbId: true } } } }),
    prisma.movieRating.findMany({ where: { userId: { in: userIds } }, select: { movie: { select: { tmdbId: true } } } }),
    prisma.userFavoriteShow.findMany({ where: { userId: { in: userIds } }, select: { tvShow: { select: { tmdbId: true } } } }),
    prisma.tVShowRating.findMany({ where: { userId: { in: userIds } }, select: { tvShow: { select: { tmdbId: true } } } }),
  ]);
  return {
    movieTmdbIds: new Set([
      ...seenMovies.map((s) => s.movie.tmdbId),
      ...ratedMovies.map((r) => r.movie.tmdbId),
    ]),
    tvTmdbIds: new Set([
      ...seenShows.map((s) => s.tvShow.tmdbId),
      ...ratedShows.map((r) => r.tvShow.tmdbId),
    ]),
  };
}
