/**
 * tmdb-sync.ts
 *
 * Server-side helpers that upsert TMDB data into our local database.
 * Called after fetching from TMDB so the DB grows organically as users browse.
 * All writes are fire-and-forget (non-blocking) on detail pages.
 */

import { prisma } from "@/lib/prisma";

// ─── Types mirrored from TMDB responses ──────────────────────────────────────

export interface TMDBMovieForSync {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  runtime?: number | null;
  tagline?: string | null;
  budget?: number | null;
  revenue?: number | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  status?: string | null;
  imdb_id?: string | null;
  // TMDB returns the franchise/collection a movie belongs to as a
  // sub-object on the movie detail response; null for standalone
  // films. Used by /box-office/franchises aggregation.
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null;
  genres?: { id: number; name: string }[];
  credits?: {
    cast?: TMDBCastForSync[];
    crew?: TMDBCrewForSync[];
  };
  releases?: {
    countries?: { iso_3166_1: string; certification: string; release_dates?: { certification: string }[] }[];
  };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[];
  };
  videos?: {
    results?: { key: string; site: string; type: string }[];
  };
}

export interface TMDBCastForSync {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  character?: string | null;
  order?: number;
  popularity?: number;
}

export interface TMDBCrewForSync {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  job?: string | null;
  department?: string | null;
  popularity?: number;
}

export interface TMDBPersonForSync {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  biography?: string | null;
  popularity?: number | null;
  imdb_id?: string | null;
  movie_credits?: {
    cast?: (TMDBCastForSync & { title?: string; vote_average?: number })[];
    crew?: (TMDBCrewForSync & { title?: string; vote_average?: number })[];
  };
}

// ─── Movie upsert ─────────────────────────────────────────────────────────────

export async function upsertMovie(tmdb: TMDBMovieForSync): Promise<string> {
  // Derive MPAA rating from release_dates (preferred) or legacy releases
  let mpaaRating: string | null = null;
  const usReleaseNew = tmdb.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
  if (usReleaseNew) {
    const rated = usReleaseNew.release_dates.find((d) => d.certification && d.type === 3)
      ?? usReleaseNew.release_dates.find((d) => d.certification);
    if (rated?.certification) mpaaRating = rated.certification;
  } else {
    const usRelease = tmdb.releases?.countries?.find((c) => c.iso_3166_1 === "US");
    if (usRelease?.certification) mpaaRating = usRelease.certification || null;
  }

  // Derive trailer key
  let trailerKey: string | null = null;
  const trailer = tmdb.videos?.results?.find(
    (v) => v.site === "YouTube" && v.type === "Trailer"
  );
  if (trailer) trailerKey = trailer.key;

  const movie = await prisma.movie.upsert({
    where: { tmdbId: tmdb.id },
    create: {
      tmdbId: tmdb.id,
      imdbId: tmdb.imdb_id ?? null,
      title: tmdb.title,
      overview: tmdb.overview ?? null,
      posterPath: tmdb.poster_path ?? null,
      backdropPath: tmdb.backdrop_path ?? null,
      releaseDate: tmdb.release_date ?? null,
      runtime: tmdb.runtime ?? null,
      mpaaRating,
      tagline: tmdb.tagline ?? null,
      budget: tmdb.budget ? BigInt(tmdb.budget) : null,
      revenue: tmdb.revenue ? BigInt(tmdb.revenue) : null,
      popularity: tmdb.popularity ?? null,
      voteAverage: tmdb.vote_average ?? null,
      voteCount: tmdb.vote_count ?? null,
      trailerKey,
      status: tmdb.status ?? null,
      tmdbCollectionId: tmdb.belongs_to_collection?.id ?? null,
      tmdbCollectionName: tmdb.belongs_to_collection?.name ?? null,
      cachedAt: new Date(),
    },
    update: {
      imdbId: tmdb.imdb_id ?? undefined,
      title: tmdb.title,
      overview: tmdb.overview ?? null,
      posterPath: tmdb.poster_path ?? null,
      backdropPath: tmdb.backdrop_path ?? null,
      releaseDate: tmdb.release_date ?? null,
      runtime: tmdb.runtime ?? null,
      mpaaRating,
      tagline: tmdb.tagline ?? null,
      budget: tmdb.budget ? BigInt(tmdb.budget) : null,
      revenue: tmdb.revenue ? BigInt(tmdb.revenue) : null,
      popularity: tmdb.popularity ?? null,
      voteAverage: tmdb.vote_average ?? null,
      voteCount: tmdb.vote_count ?? null,
      trailerKey,
      status: tmdb.status ?? null,
      tmdbCollectionId: tmdb.belongs_to_collection?.id ?? null,
      tmdbCollectionName: tmdb.belongs_to_collection?.name ?? null,
      cachedAt: new Date(),
    },
    select: { id: true },
  });

  // Upsert genres
  if (tmdb.genres && tmdb.genres.length > 0) {
    await Promise.all(
      tmdb.genres.map((g) =>
        prisma.genre.upsert({
          where: { id: g.id },
          create: { id: g.id, name: g.name },
          update: { name: g.name },
        })
      )
    );
    // Sync genre links (delete old, insert new)
    await prisma.movieGenre.deleteMany({ where: { movieId: movie.id } });
    await prisma.movieGenre.createMany({
      data: tmdb.genres.map((g) => ({ movieId: movie.id, genreId: g.id })),
      skipDuplicates: true,
    });
  }

  // Upsert cast & crew
  if (tmdb.credits) {
    await upsertCreditsForMovie(movie.id, tmdb.credits.cast ?? [], tmdb.credits.crew ?? []);
  }

  return movie.id;
}

// ─── TV Show upsert ──────────────────────────────────────────────────────────

export interface TMDBShowForSync {
  id: number;
  name: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  status?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  episode_run_time?: number[] | null;
  tagline?: string | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  external_ids?: { imdb_id?: string } | null;
  networks?: { id: number; name: string; logo_path: string | null }[];
  genres?: { id: number; name: string }[];
  seasons?: {
    id: number;
    season_number: number;
    name: string;
    overview?: string | null;
    poster_path?: string | null;
    air_date?: string | null;
    episode_count: number;
    vote_average?: number;
  }[];
  aggregate_credits?: {
    cast?: {
      id: number;
      name: string;
      profile_path?: string | null;
      known_for_department?: string | null;
      roles: { character: string; episode_count: number }[];
      order: number;
      total_episode_count: number;
      popularity?: number;
    }[];
    crew?: {
      id: number;
      name: string;
      profile_path?: string | null;
      known_for_department?: string | null;
      jobs: { job: string; episode_count: number }[];
      department?: string | null;
      total_episode_count: number;
      popularity?: number;
    }[];
  };
  content_ratings?: {
    results?: { iso_3166_1: string; rating: string }[];
  };
  videos?: {
    results?: { key: string; site: string; type: string }[];
  };
}

export async function upsertTVShow(tmdb: TMDBShowForSync): Promise<string> {
  // Derive content rating
  let contentRating: string | null = null;
  const usRating = tmdb.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
  if (usRating?.rating) contentRating = usRating.rating;

  // Derive trailer key
  let trailerKey: string | null = null;
  const trailer = tmdb.videos?.results?.find(
    (v) => v.site === "YouTube" && v.type === "Trailer"
  );
  if (trailer) trailerKey = trailer.key;

  const avgRuntime = tmdb.episode_run_time?.length
    ? Math.round(tmdb.episode_run_time.reduce((a, b) => a + b, 0) / tmdb.episode_run_time.length)
    : null;

  const tvShow = await prisma.tVShow.upsert({
    where: { tmdbId: tmdb.id },
    create: {
      tmdbId: tmdb.id,
      imdbId: tmdb.external_ids?.imdb_id ?? null,
      name: tmdb.name,
      overview: tmdb.overview ?? null,
      posterPath: tmdb.poster_path ?? null,
      backdropPath: tmdb.backdrop_path ?? null,
      firstAirDate: tmdb.first_air_date ?? null,
      lastAirDate: tmdb.last_air_date ?? null,
      status: tmdb.status ?? null,
      numberOfSeasons: tmdb.number_of_seasons ?? null,
      numberOfEpisodes: tmdb.number_of_episodes ?? null,
      episodeRunTime: avgRuntime,
      contentRating,
      tagline: tmdb.tagline ?? null,
      popularity: tmdb.popularity ?? null,
      voteAverage: tmdb.vote_average ?? null,
      voteCount: tmdb.vote_count ?? null,
      trailerKey,
      networks: tmdb.networks ?? undefined,
      cachedAt: new Date(),
    },
    update: {
      imdbId: tmdb.external_ids?.imdb_id ?? undefined,
      name: tmdb.name,
      overview: tmdb.overview ?? null,
      posterPath: tmdb.poster_path ?? null,
      backdropPath: tmdb.backdrop_path ?? null,
      firstAirDate: tmdb.first_air_date ?? null,
      lastAirDate: tmdb.last_air_date ?? null,
      status: tmdb.status ?? null,
      numberOfSeasons: tmdb.number_of_seasons ?? null,
      numberOfEpisodes: tmdb.number_of_episodes ?? null,
      episodeRunTime: avgRuntime,
      contentRating,
      tagline: tmdb.tagline ?? null,
      popularity: tmdb.popularity ?? null,
      voteAverage: tmdb.vote_average ?? null,
      voteCount: tmdb.vote_count ?? null,
      trailerKey,
      networks: tmdb.networks ?? undefined,
      cachedAt: new Date(),
    },
    select: { id: true },
  });

  // Upsert genres
  if (tmdb.genres?.length) {
    await Promise.all(
      tmdb.genres.map((g) =>
        prisma.genre.upsert({
          where: { id: g.id },
          create: { id: g.id, name: g.name },
          update: { name: g.name },
        })
      )
    );
    await prisma.tVShowGenre.deleteMany({ where: { tvShowId: tvShow.id } });
    await prisma.tVShowGenre.createMany({
      data: tmdb.genres.map((g) => ({ tvShowId: tvShow.id, genreId: g.id })),
      skipDuplicates: true,
    });
  }

  // Upsert seasons
  if (tmdb.seasons?.length) {
    for (const season of tmdb.seasons) {
      await prisma.tVSeason.upsert({
        where: { tvShowId_seasonNumber: { tvShowId: tvShow.id, seasonNumber: season.season_number } },
        create: {
          tvShowId: tvShow.id,
          tmdbId: season.id,
          seasonNumber: season.season_number,
          name: season.name ?? null,
          overview: season.overview ?? null,
          posterPath: season.poster_path ?? null,
          airDate: season.air_date ?? null,
          episodeCount: season.episode_count ?? null,
          voteAverage: season.vote_average ?? null,
        },
        update: {
          tmdbId: season.id,
          name: season.name ?? null,
          overview: season.overview ?? null,
          posterPath: season.poster_path ?? null,
          airDate: season.air_date ?? null,
          episodeCount: season.episode_count ?? null,
          voteAverage: season.vote_average ?? null,
        },
      });
    }
  }

  // Upsert cast & crew
  if (tmdb.aggregate_credits) {
    await upsertTVShowCredits(tvShow.id, tmdb.aggregate_credits.cast ?? [], tmdb.aggregate_credits.crew ?? []);
  }

  return tvShow.id;
}

async function upsertTVShowCredits(
  tvShowId: string,
  cast: NonNullable<TMDBShowForSync["aggregate_credits"]>["cast"] & object[],
  crew: NonNullable<TMDBShowForSync["aggregate_credits"]>["crew"] & object[]
): Promise<void> {
  const allPeople = [
    ...cast.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, known_for_department: c.known_for_department, popularity: c.popularity })),
    ...crew.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, known_for_department: c.known_for_department, popularity: c.popularity })),
  ];
  const uniquePeople = Array.from(new Map(allPeople.map((p) => [p.id, p])).values());

  await Promise.all(
    uniquePeople.map((p) =>
      prisma.celebrity.upsert({
        where: { tmdbId: p.id },
        create: {
          tmdbId: p.id,
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
        },
        update: {
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
        },
        select: { id: true },
      })
    )
  );

  const celebs = await prisma.celebrity.findMany({
    where: { tmdbId: { in: uniquePeople.map((p) => p.id) } },
    select: { id: true, tmdbId: true },
  });
  const celebMap = new Map(celebs.map((c) => [c.tmdbId, c.id]));

  // Upsert cast — use first role's character
  await Promise.all(
    cast.map((member, i) => {
      const celebId = celebMap.get(member.id);
      if (!celebId) return Promise.resolve();
      const character = member.roles?.[0]?.character ?? null;
      return prisma.tVShowCast.upsert({
        where: {
          tvShowId_celebrityId_creditType_job: {
            tvShowId,
            celebrityId: celebId,
            creditType: "cast",
            job: "",
          },
        },
        create: {
          tvShowId,
          celebrityId: celebId,
          creditType: "cast",
          job: "",
          character,
          castOrder: member.order ?? i,
          episodeCount: member.total_episode_count ?? null,
        },
        update: {
          character,
          castOrder: member.order ?? i,
          episodeCount: member.total_episode_count ?? null,
        },
      });
    })
  );

  // Upsert crew — use first job
  await Promise.all(
    crew.map((member) => {
      const celebId = celebMap.get(member.id);
      if (!celebId) return Promise.resolve();
      const job = member.jobs?.[0]?.job ?? "";
      return prisma.tVShowCast.upsert({
        where: {
          tvShowId_celebrityId_creditType_job: {
            tvShowId,
            celebrityId: celebId,
            creditType: "crew",
            job,
          },
        },
        create: {
          tvShowId,
          celebrityId: celebId,
          creditType: "crew",
          job,
          department: member.department ?? null,
          episodeCount: member.total_episode_count ?? null,
        },
        update: {
          department: member.department ?? null,
          episodeCount: member.total_episode_count ?? null,
        },
      });
    })
  );
}

// ─── Celebrity upsert ─────────────────────────────────────────────────────────

export async function upsertCelebrity(tmdb: TMDBPersonForSync): Promise<string> {
  const celebrity = await prisma.celebrity.upsert({
    where: { tmdbId: tmdb.id },
    create: {
      tmdbId: tmdb.id,
      imdbId: tmdb.imdb_id ?? null,
      name: tmdb.name,
      profilePath: tmdb.profile_path ?? null,
      knownForDepartment: tmdb.known_for_department ?? null,
      birthday: tmdb.birthday ?? null,
      deathday: tmdb.deathday ?? null,
      placeOfBirth: tmdb.place_of_birth ?? null,
      biography: tmdb.biography ?? null,
      popularity: tmdb.popularity ?? null,
      cachedAt: new Date(),
    },
    update: {
      imdbId: tmdb.imdb_id ?? undefined,
      name: tmdb.name,
      profilePath: tmdb.profile_path ?? null,
      knownForDepartment: tmdb.known_for_department ?? null,
      birthday: tmdb.birthday ?? null,
      deathday: tmdb.deathday ?? null,
      placeOfBirth: tmdb.place_of_birth ?? null,
      biography: tmdb.biography ?? null,
      popularity: tmdb.popularity ?? null,
      cachedAt: new Date(),
    },
    select: { id: true },
  });

  // Upsert their movie credits if provided
  if (tmdb.movie_credits) {
    const cast = (tmdb.movie_credits.cast ?? []).map((c) => ({
      ...c,
      known_for_department: c.known_for_department ?? tmdb.known_for_department ?? null,
    }));
    const crew = (tmdb.movie_credits.crew ?? []).map((c) => ({
      ...c,
      known_for_department: c.known_for_department ?? tmdb.known_for_department ?? null,
    }));
    await upsertCreditsForPerson(celebrity.id, cast, crew);
  }

  return celebrity.id;
}

// ─── Bulk celebrity upsert (for list pages) ───────────────────────────────────

/** Upsert lightweight celebrity records from a browse list (no credits, no biography). */
export async function upsertCelebrityList(
  people: {
    id: number;
    name: string;
    profile_path?: string | null;
    known_for_department?: string | null;
    popularity?: number | null;
  }[]
): Promise<void> {
  if (people.length === 0) return;
  await Promise.all(
    people.map((p) =>
      prisma.celebrity.upsert({
        where: { tmdbId: p.id },
        create: {
          tmdbId: p.id,
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
          // No cachedAt — indicates we only have partial data
        },
        update: {
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
        },
        select: { id: true },
      })
    )
  );
}

// ─── Credits helpers ──────────────────────────────────────────────────────────

/**
 * Upsert cast + crew for a movie that's already in the DB.
 * Called when syncing a movie's full detail page.
 */
async function upsertCreditsForMovie(
  movieId: string,
  cast: TMDBCastForSync[],
  crew: TMDBCrewForSync[]
): Promise<void> {
  // Upsert celebrities first (batch)
  const allPeople = [
    ...cast.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, known_for_department: c.known_for_department, popularity: c.popularity })),
    ...crew.map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path, known_for_department: c.known_for_department, popularity: c.popularity })),
  ];
  const uniquePeople = Array.from(new Map(allPeople.map((p) => [p.id, p])).values());

  await Promise.all(
    uniquePeople.map((p) =>
      prisma.celebrity.upsert({
        where: { tmdbId: p.id },
        create: {
          tmdbId: p.id,
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
        },
        update: {
          name: p.name,
          profilePath: p.profile_path ?? null,
          knownForDepartment: p.known_for_department ?? null,
          popularity: p.popularity ?? null,
        },
        select: { id: true },
      })
    )
  );

  // Load tmdbId → db id map
  const celebs = await prisma.celebrity.findMany({
    where: { tmdbId: { in: uniquePeople.map((p) => p.id) } },
    select: { id: true, tmdbId: true },
  });
  const celebMap = new Map(celebs.map((c) => [c.tmdbId, c.id]));

  // Upsert cast credits (parallel)
  await Promise.all(
    cast.map((member, i) => {
      const celebId = celebMap.get(member.id);
      if (!celebId) return Promise.resolve();
      return prisma.movieCast.upsert({
        where: {
          movieId_celebrityId_creditType_job: {
            movieId,
            celebrityId: celebId,
            creditType: "cast",
            job: "",
          },
        },
        create: {
          movieId,
          celebrityId: celebId,
          creditType: "cast",
          job: "",
          character: member.character ?? null,
          castOrder: member.order ?? i,
        },
        update: {
          character: member.character ?? null,
          castOrder: member.order ?? i,
        },
      });
    })
  );

  // Upsert crew credits (parallel)
  await Promise.all(
    crew.map((member) => {
      const celebId = celebMap.get(member.id);
      if (!celebId) return Promise.resolve();
      return prisma.movieCast.upsert({
        where: {
          movieId_celebrityId_creditType_job: {
            movieId,
            celebrityId: celebId,
            creditType: "crew",
            job: member.job ?? "",
          },
        },
        create: {
          movieId,
          celebrityId: celebId,
          creditType: "crew",
          job: member.job ?? "",
          department: member.department ?? null,
        },
        update: {
          department: member.department ?? null,
        },
      });
    })
  );
}

/**
 * Upsert a person's movie credits from their detail page (where we have full credit list).
 * Only creates Movie stubs (tmdbId + title) — full movie data is filled in when that movie is visited.
 */
async function upsertCreditsForPerson(
  celebrityId: string,
  cast: (TMDBCastForSync & { title?: string; vote_average?: number })[],
  crew: (TMDBCrewForSync & { title?: string; vote_average?: number })[]
): Promise<void> {
  const allMovieTmdbIds = [
    ...cast.map((c) => c.id),
    ...crew.map((c) => c.id),
  ];
  if (allMovieTmdbIds.length === 0) return;

  // Ensure stub Movie records exist for all credited movies
  await Promise.all(
    Array.from(new Set(allMovieTmdbIds)).map((tmdbId) => {
      const castEntry = cast.find((c) => c.id === tmdbId);
      const crewEntry = crew.find((c) => c.id === tmdbId);
      const title = (castEntry as { title?: string })?.title ?? (crewEntry as { title?: string })?.title ?? "Unknown";
      const voteAverage = castEntry?.vote_average ?? crewEntry?.vote_average ?? null;
      return prisma.movie.upsert({
        where: { tmdbId },
        create: { tmdbId, title, voteAverage },
        update: { voteAverage: voteAverage ?? undefined },
        select: { id: true },
      });
    })
  );

  // Load movie tmdbId → db id
  const movies = await prisma.movie.findMany({
    where: { tmdbId: { in: allMovieTmdbIds } },
    select: { id: true, tmdbId: true },
  });
  const movieMap = new Map(movies.map((m) => [m.tmdbId, m.id]));

  // Upsert cast credits (parallel)
  await Promise.all(
    cast.map((entry, i) => {
      const movieId = movieMap.get(entry.id);
      if (!movieId) return Promise.resolve();
      return prisma.movieCast.upsert({
        where: {
          movieId_celebrityId_creditType_job: {
            movieId,
            celebrityId,
            creditType: "cast",
            job: "",
          },
        },
        create: {
          movieId,
          celebrityId,
          creditType: "cast",
          job: "",
          character: entry.character ?? null,
          castOrder: entry.order ?? i,
        },
        update: {
          character: entry.character ?? null,
        },
      });
    })
  );

  // Upsert crew credits (parallel)
  await Promise.all(
    crew.map((entry) => {
      const movieId = movieMap.get(entry.id);
      if (!movieId) return Promise.resolve();
      return prisma.movieCast.upsert({
        where: {
          movieId_celebrityId_creditType_job: {
            movieId,
            celebrityId,
            creditType: "crew",
            job: entry.job ?? "",
          },
        },
        create: {
          movieId,
          celebrityId,
          creditType: "crew",
          job: entry.job ?? "",
          department: entry.department ?? null,
        },
        update: {
          department: entry.department ?? null,
        },
      });
    })
  );
}
