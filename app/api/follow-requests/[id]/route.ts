import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { checkBadges } from "@/lib/badges";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, name: true } });
}

/**
 * PATCH /api/follow-requests/[id] — approve or decline a pending
 * follow request. Body: { action: "accept" | "decline" }. Only the
 * followee (the request's target) can act on it.
 *
 * Accept: flip status to "accepted", run badge checks, fire the
 * standard "started following" notification on the requester (so
 * they know they're in).
 * Decline: delete the row outright. The requester sees their button
 * fall back to "Follow"; we don't notify them — that'd be a bad
 * privacy signal ("you were declined").
 */
export async function PATCH(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: requestId } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const request = await prisma.userFollow.findUnique({
    where: { id: requestId },
    select: { id: true, followerId: true, followingId: true, status: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.followingId !== user.id) {
    return NextResponse.json({ error: "Not your request to act on" }, { status: 403 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request is not pending" }, { status: 409 });
  }

  if (action === "accept") {
    await prisma.userFollow.update({
      where: { id: requestId },
      data: { status: "accepted" },
    });
    checkBadges(request.followerId, "follow").catch(() => {});
    checkBadges(user.id, "got_followed").catch(() => {});
    // Notify the requester that they're now following.
    try {
      await prisma.notification.create({
        data: {
          userId: request.followerId,
          actorId: user.id,
          type: "follow_request_accepted",
          message: `${user.name} accepted your follow request`,
        },
      });
    } catch { /* non-critical */ }
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  // decline
  await prisma.userFollow.delete({ where: { id: requestId } });
  return NextResponse.json({ ok: true, status: "declined" });
}
