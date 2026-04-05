import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET /api/notifications — list notifications + unread count */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 });

    const countOnly = req.nextUrl.searchParams.get("countOnly") === "1";

    if (countOnly) {
      const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } });
      return NextResponse.json({ unreadCount });
    }

    const cursor = req.nextUrl.searchParams.get("cursor");
    const take = 50;

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      include: { actor: { select: { name: true, avatarUrl: true, firebaseUid: true } } },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > take;
    if (hasMore) notifications.pop();

    const unreadCount = cursor
      ? await prisma.notification.count({ where: { userId: user.id, read: false } })
      : notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        targetType: n.targetType,
        targetId: n.targetId,
        link: n.link,
        actor: n.actor ? { name: n.actor.name, avatarUrl: n.actor.avatarUrl, firebaseUid: n.actor.firebaseUid } : null,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
      hasMore,
    });
  } catch (err) {
    console.error("Notifications error:", err);
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

/** PATCH /api/notifications — mark notifications as read */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ids, markAll } = await req.json();

    if (markAll) {
      await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    } else if (ids?.length) {
      await prisma.notification.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { read: true } });
    }

    return NextResponse.json({ updated: true });
  } catch (err) {
    console.error("Notification mark read error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
