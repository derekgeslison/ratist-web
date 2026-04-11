import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET: list all feedback (admin only)
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.feedback.findMany({
    include: {
      user: { select: { name: true, firebaseUid: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      category: i.category,
      message: i.message,
      email: i.email,
      status: i.status,
      adminReply: i.adminReply,
      repliedAt: i.repliedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      user: i.user,
    })),
  });
}

// PATCH: update status and/or reply (admin only)
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, reply } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (reply != null) {
    data.adminReply = reply;
    data.repliedBy = user.id;
    data.repliedAt = new Date();
  }

  const updated = await prisma.feedback.update({
    where: { id },
    data,
    include: { user: { select: { name: true, firebaseUid: true } } },
  });

  // If replying to a logged-in user, send them a notification
  if (reply && updated.userId) {
    await prisma.notification.create({
      data: {
        userId: updated.userId,
        type: "comment",
        targetType: "feedback",
        targetId: updated.id,
        message: `An admin responded to your feedback`,
        link: "/feedback/my",
      },
    }).catch(() => {});
  }

  return NextResponse.json({
    item: {
      id: updated.id,
      category: updated.category,
      message: updated.message,
      email: updated.email,
      status: updated.status,
      adminReply: updated.adminReply,
      repliedAt: updated.repliedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      user: updated.user,
    },
  });
}
