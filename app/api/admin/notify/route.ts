import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// POST — send a notification to a user
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, message } = await req.json();
  if (!userId || !message?.trim()) {
    return NextResponse.json({ error: "userId and message required" }, { status: 400 });
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: "admin",
      actorId: admin.id,
      message: message.trim(),
    },
  });

  await logAdminAction(admin.id, "notify", userId, `Sent notification: ${message.trim().slice(0, 100)}`);

  return NextResponse.json({ notification: { id: notification.id } });
}
