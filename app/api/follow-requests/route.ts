import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

/**
 * GET /api/follow-requests — list pending follow requests for the
 * current user (people who asked to follow them when their profile
 * is private).
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.userFollow.findMany({
    where: { followingId: user.id, status: "pending" },
    select: {
      id: true,
      createdAt: true,
      follower: {
        select: { id: true, firebaseUid: true, name: true, avatarUrl: true, bio: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}
