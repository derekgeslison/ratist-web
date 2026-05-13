import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Send a test push to the caller. Useful for verifying the
 * subscribe → send pipeline without needing a second user to
 * trigger a real notification. Bypasses pushPrefs entirely.
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

    const result = await sendPushToUser(dbUser.id, {
      title: "The Ratist · Test",
      body: "Push notifications are working on this device.",
      url: "/settings",
      tag: "test-push",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Push test error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
