import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET — return all user's watchlists with membership status for this movie */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) } });

    const lists = await prisma.watchlist.findMany({
      where: {
        OR: [
          { userId: user.id },
          { collaborators: { some: { userId: user.id, role: "editor", status: "accepted" } } },
        ],
      },
      select: {
        id: true, name: true, isDefault: true, userId: true,
        user: { select: { name: true } },
        movies: movie ? { where: { movieId: movie.id }, select: { id: true }, take: 1 } : undefined,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        isDefault: l.isDefault,
        isOwned: l.userId === user.id,
        ownerName: l.userId !== user.id ? l.user.name : undefined,
        hasMovie: (l.movies?.length ?? 0) > 0,
      })),
    });
  } catch (err) {
    console.error("Watchlist lists error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — toggle movie on default watchlist (for quick-add from browse pages) */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { title, poster_path, release_date } = await req.json();
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: poster_path ?? null, releaseDate: release_date ?? null },
      update: {},
    });

    // Ensure default watchlist exists
    let defaultList = await prisma.watchlist.findFirst({ where: { userId: user.id, isDefault: true } });
    if (!defaultList) {
      defaultList = await prisma.watchlist.create({
        data: { userId: user.id, name: "Watchlist", slug: "watchlist", isDefault: true },
      });
    }

    // Toggle on default watchlist
    const existing = await prisma.watchlistMovie.findUnique({
      where: { watchlistId_movieId: { watchlistId: defaultList.id, movieId: movie.id } },
    });

    if (existing) {
      await prisma.watchlistMovie.delete({
        where: { watchlistId_movieId: { watchlistId: defaultList.id, movieId: movie.id } },
      });
    } else {
      // Add at end of custom order
      const maxOrder = await prisma.watchlistMovie.aggregate({
        where: { watchlistId: defaultList.id },
        _max: { sortOrder: true },
      });
      await prisma.watchlistMovie.create({
        data: { watchlistId: defaultList.id, movieId: movie.id, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      });
    }

    // Return all lists with membership status (owned + editor-collaborated)
    const lists = await prisma.watchlist.findMany({
      where: {
        OR: [
          { userId: user.id },
          { collaborators: { some: { userId: user.id, role: "editor", status: "accepted" } } },
        ],
      },
      select: {
        id: true, name: true, isDefault: true, userId: true,
        user: { select: { name: true } },
        movies: { where: { movieId: movie.id }, select: { id: true }, take: 1 },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    const allLists = lists.map((l) => ({
      id: l.id,
      name: l.name,
      isDefault: l.isDefault,
      isOwned: l.userId === user.id,
      ownerName: l.userId !== user.id ? l.user.name : undefined,
      hasMovie: l.movies.length > 0,
    }));

    const inAnyList = allLists.some((l) => l.hasMovie);

    return NextResponse.json({
      watchlisted: inAnyList,
      defaultWatchlisted: !existing, // toggled state
      lists: allLists,
    });
  } catch (err) {
    console.error("Watchlist toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
