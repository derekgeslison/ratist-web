import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "accepted", "rejected", "completed"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.postIdea.findMany({
    include: {
      submitter: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      media: i.mediaTmdbId ? { tmdbId: i.mediaTmdbId, mediaType: i.mediaType, title: i.mediaTitle, posterPath: i.mediaPosterPath } : null,
      person: i.personTmdbId ? { tmdbId: i.personTmdbId, name: i.personName, profilePath: i.personProfilePath } : null,
      status: i.status,
      adminNotes: i.adminNotes,
      reviewedBy: i.reviewer?.name ?? null,
      reviewedAt: i.reviewedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      submitter: i.submitter,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.status && (VALID_STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status as ValidStatus;
    data.reviewedBy = user.id;
    data.reviewedAt = new Date();
  }
  if (typeof body.adminNotes === "string") {
    data.adminNotes = body.adminNotes.slice(0, 2000);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.postIdea.update({ where: { id: body.id }, data });
  return NextResponse.json({ idea: { id: updated.id, status: updated.status, adminNotes: updated.adminNotes } });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.postIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
