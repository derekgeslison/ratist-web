import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Register (or refresh) an FCM token for the signed-in user. Called
 * from the Capacitor app on first launch + whenever Firebase
 * rotates a token. Idempotent — upserts by token (the unique key).
 */
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
    const platform = body?.platform === "ios" ? "ios" : "android";
    if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    await prisma.fcmToken.upsert({
      where: { token },
      create: { userId: dbUser.id, token, platform, userAgent },
      update: { userId: dbUser.id, platform, userAgent, lastUsed: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("FCM register error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
