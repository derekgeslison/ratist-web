import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function getAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
    select: { id: true, isAdmin: true, isOwner: true },
  });
  if (!user?.isAdmin && !user?.isOwner) return null;
  return user;
}

// PATCH: lock/unlock or pin/unpin a thread (admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { slug } = await params;
  const thread = await prisma.forumThread.findUnique({ where: { slug } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, boolean> = {};

  if (typeof body.isLocked === "boolean") updates.isLocked = body.isLocked;
  if (typeof body.isPinned === "boolean") updates.isPinned = body.isPinned;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.forumThread.update({
    where: { id: thread.id },
    data: updates,
  });

  return NextResponse.json({ thread: { isLocked: updated.isLocked, isPinned: updated.isPinned } });
}
