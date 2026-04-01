import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getBatchScoreEstimates } from "@/lib/profile";

export const dynamic = "force-dynamic";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
}

/** GET — list all watchlists for the authenticated user (with movie counts + preview) */
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ watchlists: [], defaultMovies: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ watchlists: [], defaultMovies: [] });

    // Ensure default watchlist exists
    let defaultList = await prisma.watchlist.findFirst({ where: { userId: user.id, isDefault: true } });
    if (!defaultList) {
      defaultList = await prisma.watchlist.create({
        data: { userId: user.id, name: "Watchlist", slug: "watchlist", isDefault: true },
      });
    }

    // Get all user's watchlists with movie counts
    const watchlists = await prisma.watchlist.findMany({
      where: { OR: [{ userId: user.id }, { collaborators: { some: { userId: user.id } } }] },
      include: {
        _count: { select: { movies: true } },
        user: { select: { name: true, firebaseUid: true } },
        collaborators: {
          include: { user: { select: { name: true, firebaseUid: true } } },
        },
        movies: {
          take: 4,
          orderBy: { addedAt: "desc" },
          include: { movie: { select: { posterPath: true } } },
        },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    // Also load the full default watchlist movies for backward compat with the current page
    const defaultMovies = await loadWatchlistMovies(defaultList.id, user.id);

    return NextResponse.json({
      watchlists: watchlists.map((wl) => {
        const isOwner = wl.userId === user.id;
        const myCollab = wl.collaborators.find((c) => c.userId === user.id);
        return {
          id: wl.id,
          name: wl.name,
          slug: wl.slug,
          description: wl.description,
          isDefault: wl.isDefault,
          isPrivate: wl.isPrivate,
          movieCount: wl._count.movies,
          previewPosters: wl.movies.map((m) => m.movie.posterPath).filter(Boolean),
          isOwner,
          ownerName: isOwner ? undefined : wl.user.name,
          ownerUid: isOwner ? undefined : wl.user.firebaseUid,
          myRole: myCollab?.role ?? null,
          collaboratorCount: wl.collaborators.length,
          createdAt: wl.createdAt,
        };
      }),
      defaultMovies,
    });
  } catch (err) {
    console.error("Watchlist list error:", err);
    return NextResponse.json({ watchlists: [], defaultMovies: [] });
  }
}

/** POST — create a new watchlist */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { name, description, isPrivate } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    // Generate unique slug
    let baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.watchlist.findUnique({ where: { userId_slug: { userId: user.id, slug } } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const watchlist = await prisma.watchlist.create({
      data: { userId: user.id, name: name.trim(), slug, description: description?.trim() || null, isPrivate: isPrivate ?? false },
    });

    return NextResponse.json({ watchlist: { id: watchlist.id, name: watchlist.name, slug: watchlist.slug, description: watchlist.description, isDefault: false, isPrivate: watchlist.isPrivate, movieCount: 0, previewPosters: [], isOwner: true, createdAt: watchlist.createdAt } });
  } catch (err) {
    console.error("Watchlist create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Shared helper to load watchlist movies with ratings */
export async function loadWatchlistMovies(watchlistId: string, userId: string) {
  const entries = await prisma.watchlistMovie.findMany({
    where: { watchlistId },
    include: {
      movie: {
        select: {
          id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
          genres: { include: { genre: true } },
          ratings: { where: { userId }, select: { ratistRating: true }, take: 1 },
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  const unratedIds = entries.filter((e) => !e.movie.ratings[0]?.ratistRating).map((e) => e.movie.id);
  const estimates = await getBatchScoreEstimates(userId, unratedIds);

  return entries.map((e) => ({
    id: e.id,
    tmdbId: e.movie.tmdbId,
    title: e.movie.title,
    posterPath: e.movie.posterPath,
    year: e.movie.releaseDate?.slice(0, 4) ?? "",
    voteAverage: e.movie.voteAverage ?? null,
    ratistRating: e.movie.ratings[0]?.ratistRating ?? null,
    estimatedRating: !e.movie.ratings[0]?.ratistRating ? (estimates.get(e.movie.id) ?? null) : null,
    genres: e.movie.genres.map((g) => g.genre.name),
    isChecked: e.isChecked,
    checkedAt: e.checkedAt,
    addedAt: e.addedAt,
    sortOrder: e.sortOrder,
  }));
}
