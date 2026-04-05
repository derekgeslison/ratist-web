import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface CollectionMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  communityRating: number | null;
}

interface Collection {
  key: string;
  title: string;
  description: string;
  emoji: string;
  movies: CollectionMovie[];
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const which = req.nextUrl.searchParams.get("collection");

    // Fetch user's seen movie IDs and ratings
    const seenMovies = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      select: { movieId: true },
    });
    const seenIds = new Set(seenMovies.map((s) => s.movieId));

    const userRatings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      select: {
        movieId: true, ratistRating: true, overallRating: true, createdAt: true,
        storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
        cinematography: true, artisticEffect: true, overallEmotion: true, movingness: true,
        movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true, voteCount: true } },
      },
    });
    const ratingMap = new Map(userRatings.map((r) => [r.movieId, r]));

    const collections: Collection[] = [];

    // Helper: format a movie for the response
    function fmt(m: { id: string; tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null }, communityRating?: number | null): CollectionMovie {
      return { id: m.id, tmdbId: m.tmdbId, title: m.title, posterPath: m.posterPath, releaseDate: m.releaseDate, voteAverage: m.voteAverage, communityRating: communityRating ?? null };
    }

    // ── 1. Directors You Love, Films You've Missed ──
    if (!which || which === "directors") {
      // Find user's top directors (rated 8+)
      const highRated = userRatings.filter((r) => (r.ratistRating ?? 0) >= 8);
      const movieIds = highRated.map((r) => r.movieId);

      if (movieIds.length > 0) {
        const directorCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "crew", job: "Director" },
          select: { movieId: true, celebrity: { select: { id: true, name: true } } },
        });

        // Count how many highly-rated films per director
        const dirCounts = new Map<string, { name: string; count: number; avgRating: number; total: number }>();
        for (const dc of directorCredits) {
          const rating = ratingMap.get(dc.movieId);
          const score = rating?.ratistRating ?? 0;
          const existing = dirCounts.get(dc.celebrity.id) ?? { name: dc.celebrity.name, count: 0, avgRating: 0, total: 0 };
          existing.count++;
          existing.total += score;
          dirCounts.set(dc.celebrity.id, existing);
        }

        // Top directors (2+ highly rated films)
        const topDirs = [...dirCounts.entries()]
          .filter(([, d]) => d.count >= 2)
          .map(([id, d]) => ({ id, name: d.name, avg: d.total / d.count }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 5);

        if (topDirs.length > 0) {
          // Find their other movies the user hasn't seen
          const dirIds = topDirs.map((d) => d.id);
          const otherMovies = await prisma.movieCast.findMany({
            where: { celebrityId: { in: dirIds }, creditType: "crew", job: "Director", movieId: { notIn: Array.from(seenIds) } },
            select: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } } },
          });

          const unique = new Map<string, CollectionMovie>();
          for (const mc of otherMovies) {
            if (!unique.has(mc.movie.id)) unique.set(mc.movie.id, fmt(mc.movie));
          }
          const movies = [...unique.values()].sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0)).slice(0, 20);

          if (movies.length > 0) {
            const dirNames = topDirs.slice(0, 3).map((d) => d.name).join(", ");
            collections.push({
              key: "directors",
              title: "Directors You Love, Films You've Missed",
              description: `You've rated ${dirNames} highly — here are their movies you haven't seen yet.`,
              emoji: "🎬",
              movies,
            });
          }
        }
      }
    }

    // ── 2. Your Hidden Gems ──
    if (!which || which === "hidden-gems") {
      // Find movies rated highly by similar users that the user hasn't seen, with low popularity
      const userProfile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
      if (userProfile) {
        // Find movies rated 8+ by community with low vote count (hidden gems)
        const gems = await prisma.movieRating.groupBy({
          by: ["movieId"],
          _avg: { ratistRating: true },
          _count: { id: true },
          having: { ratistRating: { _avg: { gte: 8 } } },
        });

        const gemIds = gems
          .filter((g) => g._count.id >= 2 && !seenIds.has(g.movieId))
          .map((g) => g.movieId)
          .slice(0, 30);

        if (gemIds.length > 0) {
          const gemMovies = await prisma.movie.findMany({
            where: { id: { in: gemIds }, voteCount: { gte: 50, lt: 10000 } },
            select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true, voteCount: true },
            orderBy: { voteAverage: "desc" },
            take: 20,
          });

          if (gemMovies.length > 0) {
            collections.push({
              key: "hidden-gems",
              title: "Hidden Gems for You",
              description: "Highly rated by users with similar taste, but under the radar.",
              emoji: "💎",
              movies: gemMovies.map((m) => fmt(m)),
            });
          }
        }
      }
    }

    // ── 3. Your Blind Spots ──
    // TODO: N+1 query — fetches genres per rated movie in a loop. Optimize by
    // batch-loading all movieGenres for userRatings movieIds in a single query.
    if (!which || which === "blind-spots") {
      const genreCounts = new Map<string, number>();
      for (const r of userRatings) {
        const movieGenres = await prisma.movieGenre.findMany({
          where: { movieId: r.movieId },
          select: { genre: { select: { name: true } } },
        });
        for (const mg of movieGenres) {
          genreCounts.set(mg.genre.name, (genreCounts.get(mg.genre.name) ?? 0) + 1);
        }
      }
      // Also count seen-only movies
      // Find genres with fewer than 5 rated movies
      const weakGenres = [...genreCounts.entries()]
        .filter(([, count]) => count < 5)
        .map(([name]) => name);

      if (weakGenres.length > 0) {
        // Find highest-rated movies in those genres that user hasn't seen
        const genreRecords = await prisma.genre.findMany({ where: { name: { in: weakGenres } }, select: { id: true, name: true } });
        const genreIds = genreRecords.map((g) => g.id);

        const blindSpotMovies = await prisma.movie.findMany({
          where: {
            id: { notIn: Array.from(seenIds) },
            genres: { some: { genreId: { in: genreIds } } },
            voteAverage: { gte: 7 },
            voteCount: { gte: 100 },
          },
          select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true },
          orderBy: { voteAverage: "desc" },
          take: 20,
        });

        if (blindSpotMovies.length > 0) {
          collections.push({
            key: "blind-spots",
            title: "Your Blind Spots",
            description: `You've watched fewer than 5 ${weakGenres.slice(0, 3).join(", ")} films — here are the best to start with.`,
            emoji: "🔍",
            movies: blindSpotMovies.map((m) => fmt(m)),
          });
        }
      }
    }

    // ── 4. Rewatch Worthy ──
    if (!which || which === "rewatch") {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const rewatchable = userRatings
        .filter((r) => (r.ratistRating ?? 0) >= 8 && r.createdAt < oneYearAgo)
        .map((r) => ({
          ...fmt(r.movie, r.ratistRating),
          ratistRating: r.ratistRating,
        }))
        .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0))
        .slice(0, 20);

      if (rewatchable.length > 0) {
        collections.push({
          key: "rewatch",
          title: "Rewatch Worthy",
          description: "Movies you rated 8+ over a year ago — time for a rewatch?",
          emoji: "🔄",
          movies: rewatchable,
        });
      }
    }

    // ── 5. Your Style Match ──
    if (!which || which === "style-match") {
      // Find user's strongest dimension
      const dimAvgs: { dim: string; label: string; avg: number }[] = [];
      const dims = [
        { key: "storyScore", label: "Story" },
        { key: "styleScore", label: "Cinematography & Style" },
        { key: "emotiveScore", label: "Emotion" },
        { key: "actingScore", label: "Performance" },
        { key: "entertainScore", label: "Entertainment" },
      ];
      for (const dim of dims) {
        const vals = userRatings.map((r) => (r as Record<string, unknown>)[dim.key]).filter((v): v is number => v != null && typeof v === "number");
        if (vals.length > 0) dimAvgs.push({ dim: dim.key, label: dim.label, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
      }
      dimAvgs.sort((a, b) => b.avg - a.avg);

      if (dimAvgs.length > 0) {
        const topDim = dimAvgs[0];
        // Find movies rated highest in this dimension by the community
        const scoreField = topDim.dim as any;
        const topInDim = await prisma.movieRating.groupBy({
          by: ["movieId"],
          _avg: { [scoreField]: true } as any,
          _count: { id: true },
          having: { [scoreField]: { _avg: { gte: 8.5 } } } as any,
        });

        const matchIds = topInDim
          .filter((t) => t._count.id >= 2 && !seenIds.has(t.movieId))
          .map((t) => t.movieId)
          .slice(0, 30);

        if (matchIds.length > 0) {
          const matchMovies = await prisma.movie.findMany({
            where: { id: { in: matchIds } },
            select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true },
            orderBy: { voteAverage: "desc" },
            take: 20,
          });

          if (matchMovies.length > 0) {
            collections.push({
              key: "style-match",
              title: `Best in ${topDim.label}`,
              description: `You rate ${topDim.label.toLowerCase()} highest on average (${topDim.avg.toFixed(1)}) — these movies excel in that area.`,
              emoji: "🎯",
              movies: matchMovies.map((m) => fmt(m)),
            });
          }
        }
      }
    }

    // ── 6. Actors You Follow ──
    if (!which || which === "actors") {
      const highRated = userRatings.filter((r) => (r.ratistRating ?? 0) >= 8);
      const movieIds = highRated.map((r) => r.movieId);

      if (movieIds.length > 0) {
        const actorCredits = await prisma.movieCast.findMany({
          where: { movieId: { in: movieIds }, creditType: "cast", castOrder: { lte: 3 } },
          select: { movieId: true, celebrity: { select: { id: true, name: true } } },
        });

        const actorCounts = new Map<string, { name: string; count: number }>();
        for (const ac of actorCredits) {
          const existing = actorCounts.get(ac.celebrity.id) ?? { name: ac.celebrity.name, count: 0 };
          existing.count++;
          actorCounts.set(ac.celebrity.id, existing);
        }

        const topActors = [...actorCounts.entries()]
          .filter(([, a]) => a.count >= 2)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 5);

        if (topActors.length > 0) {
          const actorIds = topActors.map(([id]) => id);
          const otherMovies = await prisma.movieCast.findMany({
            where: { celebrityId: { in: actorIds }, creditType: "cast", castOrder: { lte: 3 }, movieId: { notIn: Array.from(seenIds) } },
            select: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } } },
          });

          const unique = new Map<string, CollectionMovie>();
          for (const mc of otherMovies) {
            if (!unique.has(mc.movie.id)) unique.set(mc.movie.id, fmt(mc.movie));
          }
          const movies = [...unique.values()].sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0)).slice(0, 20);

          if (movies.length > 0) {
            const actorNames = topActors.slice(0, 3).map(([, a]) => a.name).join(", ");
            collections.push({
              key: "actors",
              title: "Actors You Follow",
              description: `More from ${actorNames} and other actors you love.`,
              emoji: "⭐",
              movies,
            });
          }
        }
      }
    }

    return NextResponse.json({ collections });
  } catch (err) {
    console.error("Collections error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
