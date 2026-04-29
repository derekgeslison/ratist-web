import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// GET: list all contact submissions (admin only). Open + in-progress
// items first, newest first within each status bucket — same ordering
// as /api/admin/feedback.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.contact.findMany({
    include: { handler: { select: { name: true, firebaseUid: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      category: i.category,
      name: i.name,
      email: i.email,
      company: i.company,
      subject: i.subject,
      message: i.message,
      status: i.status,
      adminNotes: i.adminNotes,
      handledAt: i.handledAt?.toISOString() ?? null,
      handler: i.handler,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

// PATCH: update status and/or admin notes. There's no in-app reply
// flow — admins respond to inquirers via their own email client at
// the inquirer's email address.
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, notes } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (notes != null) {
    data.adminNotes = notes;
    data.handledBy = user.id;
    data.handledAt = new Date();
  }

  const updated = await prisma.contact.update({
    where: { id },
    data,
    include: { handler: { select: { name: true, firebaseUid: true } } },
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      category: updated.category,
      name: updated.name,
      email: updated.email,
      company: updated.company,
      subject: updated.subject,
      message: updated.message,
      status: updated.status,
      adminNotes: updated.adminNotes,
      handledAt: updated.handledAt?.toISOString() ?? null,
      handler: updated.handler,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
