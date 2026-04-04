import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

// This endpoint permanently deletes users past the 30-day soft-delete window
// and auto-unbans users whose ban has expired.
// Should be called daily via Vercel Cron or similar.
// Protected by CRON_SECRET env var.

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    // 1. Permanently delete users past 30-day retention
    const expiredUsers = await prisma.user.findMany({
      where: { deletedAt: { not: null, lt: thirtyDaysAgo } },
      select: { id: true, firebaseUid: true, name: true },
    });

    for (const u of expiredUsers) {
      // Delete from Firebase
      try { await adminAuth.deleteUser(u.firebaseUid); } catch { /* ignore */ }
      // Delete from DB (cascade)
      await prisma.user.delete({ where: { id: u.id } });
    }

    // 2. Auto-unban expired bans
    const unbanned = await prisma.user.updateMany({
      where: {
        bannedAt: { not: null },
        bannedUntil: { not: null, lt: new Date() },
      },
      data: { bannedAt: null, bannedUntil: null, banReason: null },
    });

    return NextResponse.json({
      purged: expiredUsers.length,
      unbanned: unbanned.count,
      purgedUsers: expiredUsers.map((u) => u.name),
    });
  } catch (err) {
    console.error("Purge cron error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
