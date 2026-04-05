import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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
    const movieEntry = await prisma.watchlistMovie.findFirst({ where: { id: movieId, watchlistId } });
    if (movieEntry) {
      const updated = await prisma.watchlistMovie.update({
        where: { id: movieId },
        data: {
          isChecked: !movieEntry.isChecked,
          checkedAt: !movieEntry.isChecked ? new Date() : null,
        },
      });
      return NextResponse.json({ isChecked: updated.isChecked, checkedAt: updated.checkedAt });
    }

    // Fall back to watchlistShow
    const showEntry = await prisma.watchlistShow.findFirst({ where: { id: movieId, watchlistId } });
    if (!showEntry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const updated = await prisma.watchlistShow.update({
      where: { id: movieId },
      data: {
        isChecked: !showEntry.isChecked,
        checkedAt: !showEntry.isChecked ? new Date() : null,
      },
    });

    return NextResponse.json({ isChecked: updated.isChecked, checkedAt: updated.checkedAt });
  } catch (err) {
    console.error("Watchlist check-off error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
