import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

/**
 * POST /api/users/[uid]/block — block the target user.
 *
 * Side-effects: also delete any existing follow relationships in
 * BOTH directions. The block hides them from each other's feeds and
 * follower/following lists, so leaving stale follow rows around
 * would let counts and badges drift out of sync. Notifications from
 * either side stop because the queries that source them filter
 * blocked users.
 */
export async function POST(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({
    where: { firebaseUid: targetFirebaseUid },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === user.id) {
    return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } },
      create: { blockerId: user.id, blockedId: target.id },
      update: {},
    }),
    prisma.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: target.id },
          { followerId: target.id, followingId: user.id },
        ],
      },
    }),
  ]);

  return NextResponse.json({ blocked: true });
}

/** DELETE /api/users/[uid]/block — unblock. */
export async function DELETE(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({
    where: { firebaseUid: targetFirebaseUid },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.userBlock.deleteMany({
    where: { blockerId: user.id, blockedId: target.id },
  });

  return NextResponse.json({ blocked: false });
}
