import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

/**
 * Remove a Web Push subscription by endpoint. Scoped to the caller's
 * userId so one user can't unsubscribe another's device.
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
    if (!endpoint) return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: dbUser.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Push unsubscribe error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
