import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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

/**
 * Bulk-rename a faction/group across every character in a companion.
 * Body: { oldGroup: string, newGroup: string }
 * newGroup can be null/empty-string to clear the group entirely on every
 * matching character.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { oldGroup?: unknown; newGroup?: unknown } | null;
  const oldGroup = typeof body?.oldGroup === "string" && body.oldGroup.length > 0 ? body.oldGroup : null;
  const newGroupRaw = typeof body?.newGroup === "string" ? body.newGroup.slice(0, 80) : null;
  const newGroup = newGroupRaw && newGroupRaw.length > 0 ? newGroupRaw : null;
  if (!oldGroup) return NextResponse.json({ error: "oldGroup required" }, { status: 400 });
  if (oldGroup === newGroup) return NextResponse.json({ error: "Old and new group are the same" }, { status: 400 });

  const result = await prisma.companionCharacter.updateMany({
    where: { companionId: id, group: oldGroup },
    data: { group: newGroup },
  });
  return NextResponse.json({ updated: result.count });
}
