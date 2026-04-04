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
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Soft delete — set deletedAt and deletedBy
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), deletedBy: "self" },
    });

    // Disable Firebase account
    try { await adminAuth.updateUser(decoded.uid, { disabled: true }); } catch { /* ignore */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
