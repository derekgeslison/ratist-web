import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

// PATCH — edit rewatch notes
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ logId: string }> }) {
  try {
    const { logId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const entry = await prisma.userWatchLog.findUnique({ where: { id: logId } });
    if (!entry || entry.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { notes } = await req.json();
    const updated = await prisma.userWatchLog.update({
      where: { id: logId },
      data: { notes: notes?.trim() || null },
    });

    return NextResponse.json({ entry: updated });
  } catch (err) {
    console.error("Watch log PATCH error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE — remove a rewatch log entry
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ logId: string }> }) {
  try {
    const { logId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const entry = await prisma.userWatchLog.findUnique({ where: { id: logId } });
    if (!entry || entry.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.userWatchLog.delete({ where: { id: logId } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Watch log DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
