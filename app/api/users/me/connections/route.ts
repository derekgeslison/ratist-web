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

// GET: get current user's followers and following lists
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [followers, following] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followingId: user.id },
      include: {
        follower: {
          select: {
            id: true, firebaseUid: true, name: true, avatarUrl: true,
            _count: { select: { ratings: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userFollow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true, firebaseUid: true, name: true, avatarUrl: true,
            _count: { select: { ratings: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    followers: followers.map((f) => ({
      ...f.follower,
      followedAt: f.createdAt.toISOString(),
    })),
    following: following.map((f) => ({
      ...f.following,
      followedAt: f.createdAt.toISOString(),
    })),
  });
}
