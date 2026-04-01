import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/users/search?q=... — search users by name or user ID (partial match) */
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const currentUser = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!currentUser) return NextResponse.json({ users: [] });

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUser.id },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { firebaseUid: { contains: q } },
        ],
      },
      select: { id: true, name: true, avatarUrl: true, firebaseUid: true },
      take: 8,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        firebaseUid: u.firebaseUid,
      })),
    });
  } catch (err) {
    console.error("User search error:", err);
    return NextResponse.json({ users: [] });
  }
}
