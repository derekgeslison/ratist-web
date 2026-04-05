import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { loadWatchlistMovies, loadWatchlistShows } from "../route";

interface Props { params: Promise<{ id: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET — single watchlist with all movies */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);

    const watchlist = await prisma.watchlist.findUnique({
      where: { id },
      include: {
        collaborators: { include: { user: { select: { name: true, firebaseUid: true } } } },
        user: { select: { name: true, firebaseUid: true } },
      },
    });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Access check: owner, collaborator, or public
    const isOwner = user?.id === watchlist.userId;
    const myCollab = user ? watchlist.collaborators.find((c) => c.userId === user.id && c.status === "accepted") : null;
    const isCollab = !!myCollab;
    if (watchlist.isPrivate && !isOwner && !isCollab) {
      return NextResponse.json({ error: "Private watchlist" }, { status: 403 });
    }

    const userId = user?.id ?? watchlist.userId;
    const [movies, shows] = await Promise.all([
      loadWatchlistMovies(id, userId),
      loadWatchlistShows(id),
    ]);

    return NextResponse.json({
      watchlist: {
        id: watchlist.id, name: watchlist.name, slug: watchlist.slug,
        description: watchlist.description, isDefault: watchlist.isDefault,
        isPrivate: watchlist.isPrivate, isOwner, isCollab,
        myRole: myCollab?.role ?? null,
        ownerName: watchlist.user.name,
        ownerUid: watchlist.user.firebaseUid,
        collaboratorCount: watchlist.collaborators.length,
      },
      movies: [...movies, ...shows],
    });
  } catch (err) {
    console.error("Watchlist GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — update watchlist name/description/privacy */
export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist || watchlist.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined && !watchlist.isDefault) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;

    const updated = await prisma.watchlist.update({ where: { id }, data });
    return NextResponse.json({ watchlist: { id: updated.id, name: updated.name, description: updated.description, isPrivate: updated.isPrivate } });
  } catch (err) {
    console.error("Watchlist PATCH error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — delete a non-default watchlist */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist || watchlist.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (watchlist.isDefault) return NextResponse.json({ error: "Cannot delete default watchlist" }, { status: 400 });

    await prisma.watchlist.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Watchlist DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
