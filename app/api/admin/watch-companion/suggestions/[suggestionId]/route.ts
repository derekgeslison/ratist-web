import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { applySuggestion } from "@/lib/watch-companion-apply";

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

// Admin resolves a suggestion: approve applies it to live data, dismiss just
// marks it so it stops showing in the queue.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ suggestionId: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { suggestionId } = await ctx.params;
  const body = await req.json().catch(() => null) as { status?: unknown; note?: unknown } | null;
  const status = body?.status === "approved" || body?.status === "dismissed" ? body.status : null;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  if (!status) return NextResponse.json({ error: "status must be 'approved' or 'dismissed'" }, { status: 400 });

  const suggestion = await prisma.companionSuggestion.findUnique({
    where: { id: suggestionId },
    select: { status: true },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: `Already ${suggestion.status}` }, { status: 400 });
  }

  await prisma.companionSuggestion.update({
    where: { id: suggestionId },
    data: {
      status,
      resolvedById: user.id,
      resolvedAt: new Date(),
      resolutionNote: note ?? (status === "approved" ? "Admin approved" : "Admin dismissed"),
    },
  });

  if (status === "approved") {
    await applySuggestion(suggestionId).catch((err) => {
      console.error("Failed to apply admin-approved suggestion:", err);
    });
  }

  return NextResponse.json({ ok: true });
}

// Admin deletes a suggestion outright (nuke).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ suggestionId: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { suggestionId } = await ctx.params;
  await prisma.companionSuggestion.delete({ where: { id: suggestionId } });
  return NextResponse.json({ ok: true });
}
