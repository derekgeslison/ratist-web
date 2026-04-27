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
 * POST /api/users/[uid]/remove-follower — remove a user who is
 * following YOU. Distinct from block: doesn't prevent them from
 * re-following (or, if you're private, re-requesting). Used when
 * a user wants to silently kick someone without escalating to a
 * full block.
 */
export async function POST(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: followerFirebaseUid } = await params;
  const follower = await prisma.user.findUnique({
    where: { firebaseUid: followerFirebaseUid },
    select: { id: true },
  });
  if (!follower) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.userFollow.deleteMany({
    where: { followerId: follower.id, followingId: user.id },
  });

  return NextResponse.json({ removed: true });
}
