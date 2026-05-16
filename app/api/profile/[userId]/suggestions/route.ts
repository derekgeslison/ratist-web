import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { maskBlockedInResponse } from "@/lib/safe-content";

export const dynamic = "force-dynamic";

// GET /api/profile/[userId]/suggestions
//
// Powers the two "suggested for you" sections on someone else's profile
// overview tab. Both lists include movies + TV shows, exclude items the
// viewer has already engaged with, and dedupe across sections (a title in
// the genre section won't reappear in the component section).
//
//   1. Component-shared:  titles the profile owner rated >= 7.5 overall
//      AND scored >= 7.5 on at least 2 of the shared components in their
//      own subfield ratings. Section is gated on the viewer + owner
//      sharing >= 2 component preferences above 7.5.
//
//   2. Genre-shared:      titles in genres both users prefer (>= 7.0)
//      that the owner rated >= 7.5.

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery", "genreAnimation",
] as const;

// Component → subfield names. Mirrors lib/profile.ts FOCUSED_CATEGORIES.
// Duplicated here intentionally — keeping the route self-contained avoids
// a profile.ts import that would pull in prisma client init twice.
const COMPONENT_FIELDS: Record<string, string[]> = {
  narrativeFocused:     ["plot", "storytelling", "pacingClimax", "premiseOriginality"],
  characterFocused:     ["relatability", "characterDev", "dialogueScripting"],
  messageFocused:       ["overallEmotion", "meaning", "movingness"],
  cinematicFocused:     ["cinematography", "artisticEffect", "visualEffects", "locationCost", "musicSound"],
  performanceFocused:   ["casting", "actingQuality", "blockingChoreo"],
  entertainmentFocused: ["appeal", "pacingClimax"],
};

// Reverse of TMDB_GENRE_TO_PROFILE for the movie genre filter. Some
// profile keys (genreBookAdapt / genreFilmNoir / genreBiopic) have no
// direct TMDB id and are intentionally absent — they can't filter movies
// at the DB level since we don't tag them.
const PROFILE_TO_TMDB_MOVIE: Record<string, number[]> = {
  genreAction:      [28, 12],
  genreHorror:      [27],
  genreDrama:       [18],
  genreHistorical:  [36, 10752],
  genreScifi:       [878],
  genreThriller:    [53],
  genreComedy:      [35],
  genreFantasy:     [14],
  genreRomance:     [10749],
  genreDocumentary: [99],
  genreFamily:      [10751],
  genreMusical:     [10402],
  genreCrime:       [80],
  genreWestern:     [37],
  genreMystery:     [9648],
  genreAnimation:   [16],
};

// TV equivalents — TMDB uses combo categories for TV (Action & Adventure,
// Sci-Fi & Fantasy, War & Politics, Kids). Most shared ids carry over.
const PROFILE_TO_TMDB_TV: Record<string, number[]> = {
  genreAction:      [10759],       // Action & Adventure
  genreDrama:       [18],
  genreScifi:       [10765],       // Sci-Fi & Fantasy
  genreFantasy:     [10765],
  genreComedy:      [35],
  genreCrime:       [80],
  genreDocumentary: [99],
  genreFamily:      [10751],
  genreMystery:     [9648],
  genreWestern:     [37],
  genreHistorical:  [10768],       // War & Politics
  // Horror, Thriller, Musical, Romance have no clean TV genre id — TV
  // collapses them into Drama. Skip rather than mis-filter.
};

const COMPONENT_THRESHOLD = 7.5;
const GENRE_THRESHOLD = 7.0;
const RATING_THRESHOLD = 7.5;
const COMPONENT_OVERLAP_MIN = 2;
const LIMIT = 12;

type SuggestionItem = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  ratistRating: number;
  mediaType: "movie" | "tv";
};

// A rating row (movie OR show) annotated with its computed per-component
// scores, used both to gate inclusion in the component section and to
// merge movie + tv rows into one suggestion stream.
interface AnnotatedRating {
  item: SuggestionItem;
  componentScores: Record<string, number | null>;
  genreIds: number[];
}

function averageOfFilled(rating: Record<string, number | null>, fields: string[]): number | null {
  const vals = fields.map((f) => rating[f]).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const viewer = await getAuthedUser(req);
    const empty = {
      shared: { components: [] as string[], genres: [] as string[] },
      componentSuggestions: [] as SuggestionItem[],
      genreSuggestions: [] as SuggestionItem[],
    };
    if (!viewer) return NextResponse.json(empty);

    const { userId } = await params;
    const owner = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { firebaseUid: userId }] },
      select: { id: true, profile: true },
    });
    if (!owner || !owner.profile) return NextResponse.json(empty);
    if (owner.id === viewer.id) return NextResponse.json(empty);

    const viewerProfile = await prisma.userProfile.findUnique({ where: { userId: viewer.id } });
    if (!viewerProfile) return NextResponse.json(empty);

    const vp = viewerProfile as unknown as Record<string, number>;
    const op = owner.profile as unknown as Record<string, number>;

    const sharedComponents = COMPONENT_KEYS.filter(
      (k) => (vp[k] ?? 0) >= COMPONENT_THRESHOLD && (op[k] ?? 0) >= COMPONENT_THRESHOLD
    );
    const sharedGenres = GENRE_KEYS.filter(
      (k) => (vp[k] ?? 0) >= GENRE_THRESHOLD && (op[k] ?? 0) >= GENRE_THRESHOLD
    );

    if (sharedComponents.length < COMPONENT_OVERLAP_MIN && sharedGenres.length === 0) {
      return NextResponse.json({
        shared: { components: sharedComponents, genres: sharedGenres },
        componentSuggestions: [],
        genreSuggestions: [],
      });
    }

    // Viewer's seen set — favourited or rated, movies + shows.
    const [vFavMov, vRatedMov, vFavShow, vRatedShow] = await Promise.all([
      prisma.userFavoriteMovie.findMany({ where: { userId: viewer.id }, select: { movieId: true } }),
      prisma.movieRating.findMany({ where: { userId: viewer.id }, select: { movieId: true } }),
      prisma.userFavoriteShow.findMany({ where: { userId: viewer.id }, select: { tvShowId: true } }),
      prisma.tVShowRating.findMany({ where: { userId: viewer.id }, select: { tvShowId: true } }),
    ]);
    const seenMovieIds = new Set([...vFavMov.map((m) => m.movieId), ...vRatedMov.map((m) => m.movieId)]);
    const seenShowIds = new Set([...vFavShow.map((s) => s.tvShowId), ...vRatedShow.map((s) => s.tvShowId)]);

    // Owner's high-rated movies + shows. We select all subfield columns
    // so we can compute the owner's per-component score on each rating
    // for the gating step. (We don't ship the subfields to the client.)
    const [ownerHighMovies, ownerHighShows] = await Promise.all([
      prisma.movieRating.findMany({
        where: { userId: owner.id, ratistRating: { gte: RATING_THRESHOLD } },
        include: {
          movie: {
            select: {
              id: true, tmdbId: true, title: true, posterPath: true,
              releaseDate: true, voteAverage: true, isAdult: true,
              genres: { select: { genreId: true } },
            },
          },
        },
        orderBy: { ratistRating: "desc" },
      }),
      prisma.tVShowRating.findMany({
        where: { userId: owner.id, ratingScope: "series", ratistRating: { gte: RATING_THRESHOLD } },
        include: {
          tvShow: {
            select: {
              id: true, tmdbId: true, name: true, posterPath: true,
              firstAirDate: true, voteAverage: true,
              genres: { select: { genreId: true } },
            },
          },
        },
        orderBy: { ratistRating: "desc" },
      }),
    ]);

    const annotated: AnnotatedRating[] = [];
    for (const r of ownerHighMovies) {
      if (r.movie.isAdult) continue;
      if (seenMovieIds.has(r.movie.id)) continue;
      const componentScores: Record<string, number | null> = {};
      for (const c of sharedComponents) {
        componentScores[c] = averageOfFilled(r as unknown as Record<string, number | null>, COMPONENT_FIELDS[c]);
      }
      annotated.push({
        item: {
          tmdbId: r.movie.tmdbId,
          title: r.movie.title,
          posterPath: r.movie.posterPath,
          releaseDate: r.movie.releaseDate,
          voteAverage: r.movie.voteAverage,
          ratistRating: r.ratistRating ?? 0,
          mediaType: "movie",
        },
        componentScores,
        genreIds: r.movie.genres.map((g) => g.genreId),
      });
    }
    for (const r of ownerHighShows) {
      if (seenShowIds.has(r.tvShow.id)) continue;
      const componentScores: Record<string, number | null> = {};
      for (const c of sharedComponents) {
        componentScores[c] = averageOfFilled(r as unknown as Record<string, number | null>, COMPONENT_FIELDS[c]);
      }
      annotated.push({
        item: {
          tmdbId: r.tvShow.tmdbId,
          title: r.tvShow.name,
          posterPath: r.tvShow.posterPath,
          releaseDate: r.tvShow.firstAirDate,
          voteAverage: r.tvShow.voteAverage,
          ratistRating: r.ratistRating ?? 0,
          mediaType: "tv",
        },
        componentScores,
        genreIds: r.tvShow.genres.map((g) => g.genreId),
      });
    }
    // Keep the global rating-desc ordering after merging movies + shows.
    annotated.sort((a, b) => b.item.ratistRating - a.item.ratistRating);

    // Build genre suggestions FIRST so we can dedupe the component list
    // against it (the genre signal is more concrete / closer to taste).
    let genreSuggestions: SuggestionItem[] = [];
    const genreKeys = new Set<string>(); // {mediaType-tmdbId} of items shown in genre section
    if (sharedGenres.length > 0) {
      const movieIds = new Set<number>(sharedGenres.flatMap((k) => PROFILE_TO_TMDB_MOVIE[k] ?? []));
      const tvIds = new Set<number>(sharedGenres.flatMap((k) => PROFILE_TO_TMDB_TV[k] ?? []));
      for (const a of annotated) {
        if (genreSuggestions.length >= LIMIT) break;
        const ids = a.item.mediaType === "tv" ? tvIds : movieIds;
        if (a.genreIds.some((g) => ids.has(g))) {
          genreSuggestions.push(a.item);
          genreKeys.add(`${a.item.mediaType}-${a.item.tmdbId}`);
        }
      }
    }

    // Component suggestions — only items where the owner scored >= 7.5 on
    // at least COMPONENT_OVERLAP_MIN of the shared components in their
    // own rating. Excludes items already in the genre section to dedupe.
    let componentSuggestions: SuggestionItem[] = [];
    if (sharedComponents.length >= COMPONENT_OVERLAP_MIN) {
      for (const a of annotated) {
        if (componentSuggestions.length >= LIMIT) break;
        if (genreKeys.has(`${a.item.mediaType}-${a.item.tmdbId}`)) continue;
        const hits = sharedComponents.filter(
          (c) => (a.componentScores[c] ?? 0) >= COMPONENT_THRESHOLD
        ).length;
        if (hits >= COMPONENT_OVERLAP_MIN) {
          componentSuggestions.push(a.item);
        }
      }
    }

    return NextResponse.json(
      await maskBlockedInResponse({
        shared: { components: sharedComponents, genres: sharedGenres },
        componentSuggestions,
        genreSuggestions,
      })
    );
  } catch (err) {
    console.error("Profile suggestions error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
