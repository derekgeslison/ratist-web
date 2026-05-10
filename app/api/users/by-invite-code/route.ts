/**
 * Look up a user by their invite code (the share-code surface on
 * profiles). Used by /tools/recommend's group mode to add a member who
 * the requester doesn't follow but whose code they have.
 *
 * Returns minimal public-safe fields only — same shape the friend picker
 * needs for the chip + the warning indicator. isSelf=true short-circuits
 * the frontend's add-self prevention.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      firebaseUid: true,
      name: true,
      avatarUrl: true,
      deletedAt: true,
      bannedAt: true,
      _count: { select: { ratings: true } },
    },
  });

  if (!target || target.deletedAt) {
    return NextResponse.json({ error: "No user with that code" }, { status: 404 });
  }
  if (target.bannedAt) {
    // Banned users shouldn't be addable to a group session.
    return NextResponse.json({ error: "No user with that code" }, { status: 404 });
  }

  return NextResponse.json({
    firebaseUid: target.firebaseUid,
    name: target.name,
    avatarUrl: target.avatarUrl,
    ratingCount: target._count.ratings,
    isSelf: target.id === me.id,
  });
}
