import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Register (or refresh) a Web Push subscription for the signed-in user.
 *
 * The browser's PushManager.subscribe() returns an object with an
 * `endpoint` and `keys.{p256dh,auth}`. We store one row per endpoint —
 * if the same browser re-subscribes after a revocation, the upsert
 * just refreshes the keys.
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
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: dbUser.id, endpoint, p256dh, auth, userAgent },
      update: { userId: dbUser.id, p256dh, auth, userAgent, lastUsed: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Push subscribe error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
