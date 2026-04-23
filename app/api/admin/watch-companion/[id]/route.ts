import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notifyCompanionRequesters } from "@/lib/watch-companion-notify";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// Full companion payload for review
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const companion = await prisma.watchCompanion.findUnique({
    where: { id },
    include: {
      characters: {
        include: { facts: true },
        orderBy: { sortOrder: "asc" },
      },
      relationships: true,
      timeline: true,
      glossary: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ companion });
}

// Publish / unpublish / delete
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { status?: unknown } | null;
  const status = body?.status === "published" || body?.status === "draft" ? body.status : null;
  if (!status) return NextResponse.json({ error: "status must be 'published' or 'draft'" }, { status: 400 });

  const previous = await prisma.watchCompanion.findUnique({
    where: { id },
    select: { id: true, title: true, tmdbId: true, mediaType: true, seasonsGenerated: true, status: true },
  });
  if (!previous) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.watchCompanion.update({
    where: { id },
    data: {
      status,
      publishedAt: status === "published" ? new Date() : null,
    },
  });

  if (status === "published" && previous.status !== "published") {
    await notifyCompanionRequesters(updated.id, user.id);
  }

  return NextResponse.json({ companion: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  await prisma.watchCompanion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
