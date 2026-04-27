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
 * GET /api/users/me/blocks — list of users the current user has
 * blocked. Settings → Privacy uses this to render the unblock UI.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      blocked: {
        select: { id: true, firebaseUid: true, name: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json({ blocks });
}
