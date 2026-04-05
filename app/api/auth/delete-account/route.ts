import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, isOwner: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.isOwner) return NextResponse.json({ error: "Owner account cannot be deleted" }, { status: 403 });

    // Soft delete — set deletedAt and deletedBy
    // Don't disable Firebase account — user needs to be able to log back in
    // within 30 days to restore or start fresh
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), deletedBy: "self" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
