import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

// Soft-delete with immediate identity anonymization. The user row stays
// for 30 days so the user can change their mind and restore, but during
// that window their name/avatar/bio are replaced with a generic
// "Deleted user" placeholder — across comments, reviews, forum posts,
// everywhere their name displays. The original values are snapshotted
// into deletedSnapshot so the restore path can put them back.
//
// Firebase account is NOT disabled here — the user needs to be able to
// log in to choose restore-vs-fresh inside the 30-day window. The cron
// at /api/cron/purge-users handles the day-30 cascade delete.

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, isOwner: true, name: true, avatarUrl: true, bio: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.isOwner) return NextResponse.json({ error: "Owner account cannot be deleted" }, { status: 403 });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        deletedBy: "self",
        // Snapshot identity for the restore path; then anonymize live fields.
        deletedSnapshot: {
          name: user.name,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
        },
        name: "Deleted user",
        avatarUrl: null,
        bio: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
