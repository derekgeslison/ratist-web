import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

interface Props { params: Promise<{ id: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET — list collaborators for a watchlist (owner only) */
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
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { addedAt: "asc" },
    });

    return NextResponse.json({
      collaborators: collaborators.map((c) => ({
        userId: c.userId,
        name: c.user.name,
        avatarUrl: c.user.avatarUrl,
        role: c.role,
        status: c.status,
      })),
    });
  } catch (err) {
    console.error("Collaborators GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — invite a user by invite code OR by mutual-follow userId */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (watchlist.userId !== user.id) return NextResponse.json({ error: "Only the owner can invite collaborators" }, { status: 403 });

    const { inviteCode, userId: targetUserId, role } = await req.json();
    const cleanRole = role === "viewer" ? "viewer" : "editor";

    // Two invite paths: by code (existing) or by mutual-follow userId
    // (new). The userId path is gated to mutual follows only so a
    // viewer can't add an arbitrary stranger by guessing user ids.
    let target: { id: string; name: string | null; avatarUrl: string | null } | null = null;
    if (typeof targetUserId === "string" && targetUserId.length > 0) {
      const candidate = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, avatarUrl: true },
      });
      if (!candidate) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (candidate.id === user.id) return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
      // Mutual-follow check — both directions must be accepted.
      const [iFollowThem, theyFollowMe] = await Promise.all([
        prisma.userFollow.findFirst({
          where: { followerId: user.id, followingId: candidate.id, status: "accepted" },
          select: { id: true },
        }),
        prisma.userFollow.findFirst({
          where: { followerId: candidate.id, followingId: user.id, status: "accepted" },
          select: { id: true },
        }),
      ]);
      if (!iFollowThem || !theyFollowMe) {
        return NextResponse.json({ error: "Can only invite users who follow you back" }, { status: 403 });
      }
      target = candidate;
    } else {
      if (!inviteCode?.trim()) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
      target = await prisma.user.findUnique({
        where: { inviteCode: inviteCode.trim() },
        select: { id: true, name: true, avatarUrl: true },
      });
      if (!target) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
      if (target.id === user.id) return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 });
    }

    const existing = await prisma.watchlistCollaborator.findUnique({
      where: { watchlistId_userId: { watchlistId: id, userId: target.id } },
    });
    if (existing) return NextResponse.json({ error: "User already invited" }, { status: 409 });

    await prisma.watchlistCollaborator.create({
      data: { watchlistId: id, userId: target.id, role: cleanRole, status: "pending" },
    });

    notify({
      recipientId: target.id,
      actorId: user.id,
      type: "watchlist_invite",
      targetType: "watchlist",
      targetId: id,
      message: `${user.name} invited you to collaborate on "${watchlist.name}"`,
      link: "/watchlist",
    });

    return NextResponse.json({
      collaborator: {
        userId: target.id,
        name: target.name,
        avatarUrl: target.avatarUrl,
        role: cleanRole,
        status: "pending",
      },
    });
  } catch (err) {
    console.error("Collaborator invite error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — change role, or accept/decline an invite */
export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    // Accept or decline an invite (collaborator themselves)
    if (body.action === "accept" || body.action === "decline") {
      const entry = await prisma.watchlistCollaborator.findUnique({
        where: { watchlistId_userId: { watchlistId: id, userId: user.id } },
      });
      if (!entry || entry.status !== "pending") {
        return NextResponse.json({ error: "No pending invite found" }, { status: 404 });
      }

      if (body.action === "decline") {
        await prisma.watchlistCollaborator.delete({
          where: { watchlistId_userId: { watchlistId: id, userId: user.id } },
        });
        return NextResponse.json({ declined: true });
      }

      await prisma.watchlistCollaborator.update({
        where: { watchlistId_userId: { watchlistId: id, userId: user.id } },
        data: { status: "accepted" },
      });

      notify({
        recipientId: watchlist.userId,
        actorId: user.id,
        type: "invite_accepted",
        targetType: "watchlist",
        targetId: id,
        message: `${user.name} accepted your invite to ${watchlist.name}`,
        link: "/watchlist",
      });

      return NextResponse.json({ accepted: true });
    }

    // Change role (owner only)
    if (watchlist.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { userId, role } = body;
    const cleanRole = role === "viewer" ? "viewer" : "editor";

    await prisma.watchlistCollaborator.update({
      where: { watchlistId_userId: { watchlistId: id, userId } },
      data: { role: cleanRole },
    });

    return NextResponse.json({ updated: true, role: cleanRole });
  } catch (err) {
    console.error("Collaborator update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — remove a collaborator (owner removes, or collaborator leaves).
 *  `userId` in the body is OPTIONAL — if absent, the caller is leaving
 *  the list themselves. Required only when the owner is removing a
 *  specific collaborator. The previous shape required `userId` always,
 *  and the client's leave path was sending the Firebase UID (not the
 *  Postgres id) which never matched and always 403'd. */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({} as { userId?: string }));
    const isOwner = watchlist.userId === user.id;
    // Self-leave when no target given OR target equals the caller.
    // Owner can target any collaborator (or leave themselves, though
    // owners use Delete, not Leave, in practice).
    const targetUserId = body?.userId ?? user.id;
    const isSelf = targetUserId === user.id;

    if (!isOwner && !isSelf) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.watchlistCollaborator.delete({
      where: { watchlistId_userId: { watchlistId: id, userId: targetUserId } },
    });

    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error("Collaborator remove error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
