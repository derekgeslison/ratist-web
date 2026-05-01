import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { nextSortOrderForList } from "@/lib/watchlist-sort-order";

interface Props { params: Promise<{ id: string }> }

/** POST — add a movie to this watchlist */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: watchlistId } = await params;
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check access: owner or editor collaborator
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      include: { collaborators: { where: { userId: user.id } } },
    });
    if (!watchlist) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    const isOwner = watchlist.userId === user.id;
    const isEditor = watchlist.collaborators.some((c) => c.role === "editor" && c.status === "accepted");
    if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { tmdbId, title, posterPath, releaseDate, mediaType, sortOrder: explicitSortOrder } = await req.json();
    if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 });

    // Accept an explicit sortOrder for bulk-import flows (e.g. promote a
    // collection to a watchlist) where the caller knows the precise
    // ordering it wants and the auto-derived "top/bottom" behavior would
    // shuffle the result.
    const explicitSort = typeof explicitSortOrder === "number" && Number.isFinite(explicitSortOrder)
      ? explicitSortOrder
      : null;

    if (mediaType === "tv") {
      const tvShow = await prisma.tVShow.upsert({
        where: { tmdbId: Number(tmdbId) },
        create: { tmdbId: Number(tmdbId), name: title ?? "Unknown", posterPath: posterPath ?? null, firstAirDate: releaseDate ?? null },
        update: {},
      });

      const existing = await prisma.watchlistShow.findUnique({
        where: { watchlistId_tvShowId: { watchlistId, tvShowId: tvShow.id } },
      });
      if (!existing) {
        const sortOrder = explicitSort ?? await nextSortOrderForList(watchlistId, user.watchlistAddPosition);
        await prisma.watchlistShow.create({
          data: { watchlistId, tvShowId: tvShow.id, sortOrder },
        });
      }
    } else {
      const movie = await prisma.movie.upsert({
        where: { tmdbId: Number(tmdbId) },
        create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: posterPath ?? null, releaseDate: releaseDate ?? null },
        update: {},
      });

      const existing = await prisma.watchlistMovie.findUnique({
        where: { watchlistId_movieId: { watchlistId, movieId: movie.id } },
      });
      if (!existing) {
        const sortOrder = explicitSort ?? await nextSortOrderForList(watchlistId, user.watchlistAddPosition);
        await prisma.watchlistMovie.create({
          data: { watchlistId, movieId: movie.id, sortOrder },
        });
      }
    }

    return NextResponse.json({ added: true });
  } catch (err) {
    console.error("Watchlist add movie error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
