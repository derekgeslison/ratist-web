import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/** Remove an FCM token, scoped to caller's userId. */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : null;
    if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

    await prisma.fcmToken.deleteMany({
      where: { token, userId: dbUser.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("FCM unregister error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
