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

/**
 * Mutual-follow picker for the collaborator-add UI. Returns the
 * viewer's mutual follows (people they follow who also follow them
 * back, both sides `status = accepted`) minus anyone already invited
 * as a collaborator on this watchlist. Only the watchlist owner can
 * call this — same gate as the POST collaborators handler.
 *
 * The mutual-follow path lets users add collaborators by name without
 * exposing each other's invite codes. Invite codes stay opt-in
 * sharing.
 */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const watchlist = await prisma.watchlist.findUnique({ where: { id }, select: { userId: true } });
    if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (watchlist.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Two side queries + intersection. Cheaper than a self-join for
    // the typical follower counts we see.
    const [following, followers] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followerId: user.id, status: "accepted" },
        select: { followingId: true },
      }),
      prisma.userFollow.findMany({
        where: { followingId: user.id, status: "accepted" },
        select: { followerId: true },
      }),
    ]);
    const followingIds = new Set(following.map((f) => f.followingId));
    const mutualIds = followers
      .map((f) => f.followerId)
      .filter((id) => followingIds.has(id));

    if (mutualIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Strip out anyone already invited (pending or accepted) on this
    // watchlist — the picker shouldn't show them as candidates.
    const existingCollabs = await prisma.watchlistCollaborator.findMany({
      where: { watchlistId: id, userId: { in: mutualIds } },
      select: { userId: true },
    });
    const collabSet = new Set(existingCollabs.map((c) => c.userId));
    const candidateIds = mutualIds.filter((id) => !collabSet.has(id));

    if (candidateIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Mutual-follows error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
