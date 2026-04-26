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

    // Try watchlistMovie first
    const movieEntry = await prisma.watchlistMovie.findFirst({ where: { id: movieId, watchlistId }, include: { movie: { select: { id: true } } } });
    if (movieEntry) {
      const newChecked = !movieEntry.isChecked;
      const updated = await prisma.watchlistMovie.update({
        where: { id: movieId },
        data: { isChecked: newChecked, checkedAt: newChecked ? new Date() : null },
      });

      // Auto-mark as seen if user has the setting enabled
      if (newChecked && user.autoSeenOnWatchlistCheck) {
        const existing = await prisma.userFavoriteMovie.findUnique({
          where: { userId_movieId: { userId: user.id, movieId: movieEntry.movieId } },
        });
        if (!existing) {
          await prisma.userFavoriteMovie.create({
            data: { userId: user.id, movieId: movieEntry.movieId, watchedDate: user.autoDateOnSeen ? new Date() : null },
          });
          autoRemoveFromWatchlists(
            user.id,
            user.autoRemoveFromWatchlistOnSeen as "none" | "all" | "default",
            { movieId: movieEntry.movieId }
          ).catch(() => {});
        }
      }

      return NextResponse.json({ isChecked: updated.isChecked, checkedAt: updated.checkedAt, markedAsSeen: newChecked && user.autoSeenOnWatchlistCheck });
    }

    // Fall back to watchlistShow
    const showEntry = await prisma.watchlistShow.findFirst({ where: { id: movieId, watchlistId }, include: { tvShow: { select: { id: true } } } });
    if (!showEntry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const newChecked = !showEntry.isChecked;
    const updated = await prisma.watchlistShow.update({
      where: { id: movieId },
      data: { isChecked: newChecked, checkedAt: newChecked ? new Date() : null },
    });

    // Auto-mark TV show as seen if user has the setting enabled
    if (newChecked && user.autoSeenOnWatchlistCheck) {
      const existing = await prisma.userFavoriteShow.findUnique({
        where: { userId_tvShowId: { userId: user.id, tvShowId: showEntry.tvShowId } },
      });
      if (!existing) {
        await prisma.userFavoriteShow.create({
          data: { userId: user.id, tvShowId: showEntry.tvShowId },
        });
        autoRemoveFromWatchlists(
          user.id,
          user.autoRemoveFromWatchlistOnSeen as "none" | "all" | "default",
          { tvShowId: showEntry.tvShowId }
        ).catch(() => {});
      }
    }

    return NextResponse.json({ isChecked: updated.isChecked, checkedAt: updated.checkedAt, markedAsSeen: newChecked && user.autoSeenOnWatchlistCheck });
  } catch (err) {
    console.error("Watchlist check-off error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
