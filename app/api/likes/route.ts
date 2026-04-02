import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET /api/likes?targetType=blog&targetId=xyz — check like status + count */
export async function GET(req: NextRequest) {
  try {
    const targetType = req.nextUrl.searchParams.get("targetType");
    const targetId = req.nextUrl.searchParams.get("targetId");
    if (!targetType || !targetId) return NextResponse.json({ likeCount: 0, likedByMe: false });

    const user = await getAuthedUser(req);

    const [count, myLike] = await Promise.all([
      prisma.postLike.count({ where: { targetType, targetId } }),
      user ? prisma.postLike.findUnique({
        where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      }) : null,
    ]);

    return NextResponse.json({ likeCount: count, likedByMe: !!myLike });
  } catch (err) {
    console.error("Like GET error:", err);
    return NextResponse.json({ likeCount: 0, likedByMe: false });
  }
}

/** POST /api/likes — toggle a post like */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetType, targetId } = await req.json();
    if (!targetType || !targetId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const existing = await prisma.postLike.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
    });

    if (existing) {
      await prisma.postLike.delete({
        where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      });
      const count = await prisma.postLike.count({ where: { targetType, targetId } });
      return NextResponse.json({ liked: false, likeCount: count });
    } else {
      await prisma.postLike.create({
        data: { userId: user.id, targetType, targetId },
      });
      const count = await prisma.postLike.count({ where: { targetType, targetId } });
      return NextResponse.json({ liked: true, likeCount: count });
    }
  } catch (err) {
    console.error("Like POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
