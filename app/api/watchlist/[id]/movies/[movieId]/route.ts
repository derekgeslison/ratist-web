import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { autoRemoveFromWatchlists } from "@/lib/watchlist-auto-remove";

interface Props { params: Promise<{ id: string; movieId: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

async function checkAccess(watchlistId: string, userId: string) {
  const wl = await prisma.watchlist.findUnique({
    where: { id: watchlistId },
    include: { collaborators: { where: { userId } } },
  });
  if (!wl) return null;
  const isOwner = wl.userId === userId;
  const isEditor = wl.collaborators.some((c) => c.role === "editor" && c.status === "accepted");
  return isOwner || isEditor ? wl : null;
}

/** DELETE — remove a movie or show from this watchlist */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id: watchlistId, movieId } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wl = await checkAccess(watchlistId, user.id);
    if (!wl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Try deleting from watchlistMovie first, then watchlistShow
    const movieDel = await prisma.watchlistMovie.deleteMany({
      where: { id: movieId, watchlistId },
    });
    if (movieDel.count === 0) {
      await prisma.watchlistShow.deleteMany({
        where: { id: movieId, watchlistId },
      });
    }

    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error("Watchlist remove entry error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — toggle check-off on a movie or show */
export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { id: watchlistId, movieId } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wl = await checkAccess(watchlistId, user.id);
    if (!wl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const removeMode = user.autoRemoveFromWatchlistOnSeen as "none" | "all" | "default";

    // Try watchlistMovie first
    const movieEntry = await prisma.watchlistMovie.findFirst({
      where: { id: movieId, watchlistId },
      include: { movie: { select: { id: true, tmdbId: true } } },
    });
    if (movieEntry) {
      const newChecked = !movieEntry.isChecked;
      const updated = await prisma.watchlistMovie.update({
        where: { id: movieId },
        data: { isChecked: newChecked, checkedAt: newChecked ? new Date() : null },
      });

      let watchedDate: Date | null = null;
      let autoRemoveFired = false;
      if (newChecked && user.autoSeenOnWatchlistCheck) {
        const existing = await prisma.userFavoriteMovie.findUnique({
          where: { userId_movieId: { userId: user.id, movieId: movieEntry.movieId } },
        });
        if (!existing) {
          watchedDate = user.autoDateOnSeen ? new Date() : null;
          await prisma.userFavoriteMovie.create({
            data: { userId: user.id, movieId: movieEntry.movieId, watchedDate },
          });
          // Awaited (not fire-and-forget) so the response can
          // accurately tell the client whether the active list lost
          // this entry — used to drop the row after the date popup
          // is dismissed.
          await autoRemoveFromWatchlists(user.id, removeMode, { movieId: movieEntry.movieId });
          autoRemoveFired = true;
        } else {
          watchedDate = existing.watchedDate;
        }
      }

      const removedFromActiveList = autoRemoveFired && (
        removeMode === "all" || (removeMode === "default" && wl.isDefault)
      );

      return NextResponse.json({
        isChecked: updated.isChecked,
        checkedAt: updated.checkedAt,
        markedAsSeen: newChecked && user.autoSeenOnWatchlistCheck,
        mediaType: "movie",
        tmdbId: movieEntry.movie.tmdbId,
        watchedDate: watchedDate ? watchedDate.toISOString() : null,
        removedFromActiveList,
      });
    }

    // Fall back to watchlistShow
    const showEntry = await prisma.watchlistShow.findFirst({
      where: { id: movieId, watchlistId },
      include: { tvShow: { select: { id: true, tmdbId: true } } },
    });
    if (!showEntry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const newChecked = !showEntry.isChecked;
    const updated = await prisma.watchlistShow.update({
      where: { id: movieId },
      data: { isChecked: newChecked, checkedAt: newChecked ? new Date() : null },
    });

    let showAutoRemoveFired = false;
    if (newChecked && user.autoSeenOnWatchlistCheck) {
      const existing = await prisma.userFavoriteShow.findUnique({
        where: { userId_tvShowId: { userId: user.id, tvShowId: showEntry.tvShowId } },
      });
      if (!existing) {
        await prisma.userFavoriteShow.create({
          data: { userId: user.id, tvShowId: showEntry.tvShowId },
        });
        await autoRemoveFromWatchlists(user.id, removeMode, { tvShowId: showEntry.tvShowId });
        showAutoRemoveFired = true;
      }
    }

    const showRemovedFromActiveList = showAutoRemoveFired && (
      removeMode === "all" || (removeMode === "default" && wl.isDefault)
    );

    return NextResponse.json({
      isChecked: updated.isChecked,
      checkedAt: updated.checkedAt,
      markedAsSeen: newChecked && user.autoSeenOnWatchlistCheck,
      mediaType: "tv",
      tmdbId: showEntry.tvShow.tmdbId,
      watchedDate: null,
      removedFromActiveList: showRemovedFromActiveList,
    });
  } catch (err) {
    console.error("Watchlist check-off error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
