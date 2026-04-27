import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ id: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch { return null; }
}

// Compute the decade label (e.g. 1995 → "1990s") for a 4-digit year string.
function decadeOf(year: string | null | undefined): string | null {
  if (!year) return null;
  const y = parseInt(year, 10);
  if (!Number.isFinite(y) || y < 1880 || y > 2100) return null;
  return `${Math.floor(y / 10) * 10}s`;
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const viewer = await getAuthedUser(req);

    const watchlist = await prisma.watchlist.findUnique({
      where: { id },
      include: { collaborators: { select: { userId: true, status: true } } },
    });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Same access rules as GET /api/watchlist/[id]: owner, accepted
    // collaborator, or any signed-in viewer for public lists.
    const isOwner = viewer?.id === watchlist.userId;
    const isCollab = !!viewer && watchlist.collaborators.some((c) => c.userId === viewer.id && c.status === "accepted");
    if (watchlist.isPrivate && !isOwner && !isCollab) {
      return NextResponse.json({ error: "Private watchlist" }, { status: 403 });
    }

    // Stats are computed from the OWNER's perspective — the list belongs to
    // them, and "rated %"/"rewatched" describe their journey through it.
    const ownerId = watchlist.userId;

    const [movieEntries, showEntries] = await Promise.all([
      prisma.watchlistMovie.findMany({
        where: { watchlistId: id },
        select: {
          isChecked: true,
          movie: {
            select: {
              id: true, releaseDate: true, runtime: true,
              genres: { select: { genre: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.watchlistShow.findMany({
        where: { watchlistId: id },
        select: {
          isChecked: true,
          tvShow: {
            select: {
              id: true, firstAirDate: true, numberOfEpisodes: true, episodeRunTime: true,
              genres: { select: { genre: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);

    const movieIds = movieEntries.map((e) => e.movie.id);
    const showIds = showEntries.map((e) => e.tvShow.id);

    // Owner's ratings, owner's rewatches, and director credits in parallel.
    // ratingScope: "series" so we only count series-level TV ratings — per-
    // season ratings would inflate the rated % if a user rated multiple
    // seasons of the same show.
    const [movieRatings, showRatings, rewatchLogs, directorCredits] = await Promise.all([
      movieIds.length
        ? prisma.movieRating.findMany({
            where: { userId: ownerId, movieId: { in: movieIds } },
            select: { movieId: true, ratistRating: true },
          })
        : Promise.resolve([] as { movieId: string; ratistRating: number | null }[]),
      showIds.length
        ? prisma.tVShowRating.findMany({
            where: { userId: ownerId, tvShowId: { in: showIds }, ratingScope: "series" },
            select: { tvShowId: true, ratistRating: true },
          })
        : Promise.resolve([] as { tvShowId: string; ratistRating: number | null }[]),
      movieIds.length
        ? prisma.userWatchLog.count({
            where: { userId: ownerId, movieId: { in: movieIds }, isRewatch: true },
          })
        : Promise.resolve(0),
      movieIds.length
        ? prisma.movieCast.findMany({
            where: { movieId: { in: movieIds }, creditType: "crew", job: "Director" },
            select: { celebrity: { select: { name: true } } },
          })
        : Promise.resolve([] as { celebrity: { name: string } }[]),
    ]);

    // ── Totals ──
    const totalMovies = movieEntries.length;
    const totalShows = showEntries.length;
    const totalItems = totalMovies + totalShows;

    // ── Watched ── (isChecked across both)
    const watchedMovies = movieEntries.filter((e) => e.isChecked).length;
    const watchedShows = showEntries.filter((e) => e.isChecked).length;
    const watchedCount = watchedMovies + watchedShows;

    // ── Rated ── (a rating row exists for this owner + item)
    // Cap at 1 per item so duplicates can't push percent above 100. Series-
    // scope filter on TV already collapses per-season rows.
    const ratedMovieSet = new Set(movieRatings.filter((r) => r.ratistRating != null).map((r) => r.movieId));
    const ratedShowSet = new Set(showRatings.filter((r) => r.ratistRating != null).map((r) => r.tvShowId));
    const ratedCount = ratedMovieSet.size + ratedShowSet.size;

    // Average rating (only across items that actually have a rating).
    const ratingValues = [
      ...movieRatings.map((r) => r.ratistRating).filter((v): v is number => v != null),
      ...showRatings.map((r) => r.ratistRating).filter((v): v is number => v != null),
    ];
    const avgRating = ratingValues.length > 0
      ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
      : null;

    // 1–10 distribution. Bucket by Math.round so 7.4 → 7, 7.5 → 8.
    const distribution: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) distribution[i] = 0;
    for (const v of ratingValues) {
      const bucket = Math.max(1, Math.min(10, Math.round(v)));
      distribution[bucket]++;
    }

    // ── Total runtime (minutes) ──
    let runtimeMinutes = 0;
    for (const e of movieEntries) {
      if (e.movie.runtime) runtimeMinutes += e.movie.runtime;
    }
    for (const e of showEntries) {
      const ep = e.tvShow.numberOfEpisodes ?? 0;
      const er = e.tvShow.episodeRunTime ?? 0;
      if (ep > 0 && er > 0) runtimeMinutes += ep * er;
    }

    // ── Top genres / decades / directors ──
    const genreCounts = new Map<string, number>();
    for (const e of movieEntries) {
      for (const g of e.movie.genres) genreCounts.set(g.genre.name, (genreCounts.get(g.genre.name) ?? 0) + 1);
    }
    for (const e of showEntries) {
      for (const g of e.tvShow.genres) genreCounts.set(g.genre.name, (genreCounts.get(g.genre.name) ?? 0) + 1);
    }
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const decadeCounts = new Map<string, number>();
    for (const e of movieEntries) {
      const d = decadeOf(e.movie.releaseDate?.slice(0, 4));
      if (d) decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
    }
    for (const e of showEntries) {
      const d = decadeOf(e.tvShow.firstAirDate?.slice(0, 4));
      if (d) decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
    }
    const topDecades = [...decadeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const directorCounts = new Map<string, number>();
    for (const c of directorCredits) {
      directorCounts.set(c.celebrity.name, (directorCounts.get(c.celebrity.name) ?? 0) + 1);
    }
    const topDirectors = [...directorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      totals: { items: totalItems, movies: totalMovies, shows: totalShows },
      watched: {
        count: watchedCount,
        percent: totalItems > 0 ? Math.round((watchedCount / totalItems) * 100) : 0,
      },
      rated: {
        count: ratedCount,
        percent: totalItems > 0 ? Math.round((ratedCount / totalItems) * 100) : 0,
        avg: avgRating != null ? Number(avgRating.toFixed(2)) : null,
        distribution,
      },
      rewatched: rewatchLogs,
      runtimeMinutes,
      topGenres,
      topDecades,
      topDirectors,
    });
  } catch (err) {
    console.error("Watchlist stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
