import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ id: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET — list collaborators for a watchlist */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (watchlist.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const collaborators = await prisma.watchlistCollaborator.findMany({
      where: { watchlistId: id },
      include: { user: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } } },
      orderBy: { addedAt: "asc" },
    });

    return NextResponse.json({
      owner: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      collaborators: collaborators.map((c) => ({
        userId: c.userId,
        name: c.user.name,
        avatarUrl: c.user.avatarUrl,
        firebaseUid: c.user.firebaseUid,
        role: c.role,
        addedAt: c.addedAt,
      })),
    });
  } catch (err) {
    console.error("Collaborators GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — invite a user as collaborator (by name or email) */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (watchlist.userId !== user.id) return NextResponse.json({ error: "Only the owner can invite collaborators" }, { status: 403 });

    const { userId: targetUserId, role } = await req.json();
    if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    const cleanRole = role === "viewer" ? "viewer" : "editor";

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.id === user.id) return NextResponse.json({ error: "You can't add yourself" }, { status: 400 });

    // Check if already a collaborator
    const existing = await prisma.watchlistCollaborator.findUnique({
      where: { watchlistId_userId: { watchlistId: id, userId: target.id } },
    });
    if (existing) return NextResponse.json({ error: "User is already a collaborator" }, { status: 409 });

    await prisma.watchlistCollaborator.create({
      data: { watchlistId: id, userId: target.id, role: cleanRole },
    });

    return NextResponse.json({
      collaborator: {
        userId: target.id,
        name: target.name,
        avatarUrl: target.avatarUrl,
        firebaseUid: target.firebaseUid,
        role: cleanRole,
      },
    });
  } catch (err) {
    console.error("Collaborator invite error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — change a collaborator's role */
export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist || watchlist.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId, role } = await req.json();
    const cleanRole = role === "viewer" ? "viewer" : "editor";

    await prisma.watchlistCollaborator.update({
      where: { watchlistId_userId: { watchlistId: id, userId } },
      data: { role: cleanRole },
    });

    return NextResponse.json({ updated: true, role: cleanRole });
  } catch (err) {
    console.error("Collaborator role update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — remove a collaborator (owner removes, or collaborator leaves) */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { userId } = await req.json();
    const isOwner = watchlist.userId === user.id;
    const isSelf = userId === user.id;

    // Owner can remove anyone, collaborator can only remove themselves
    if (!isOwner && !isSelf) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.watchlistCollaborator.delete({
      where: { watchlistId_userId: { watchlistId: id, userId } },
    });

    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error("Collaborator remove error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
