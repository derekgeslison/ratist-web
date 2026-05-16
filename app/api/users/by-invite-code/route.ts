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

  // Anti-enumeration rate limit. Invite codes are 7 hex chars
  // (~268M keyspace). Without a limit, a script with parallel
  // requests could scan a meaningful chunk of the namespace and
  // map valid codes → names/avatars. 60 lookups/hour kills the
  // attack while staying generous for legitimate friend-picker
  // use (rarely more than 5 per session). Tracked in AiUsageLog
  // because we already index it by (userId, feature, createdAt).
  if (!me.isAdmin) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.aiUsageLog.count({
      where: { userId: me.id, feature: "invite_code_lookup", createdAt: { gte: hourAgo } },
    });
    if (recentCount >= 60) {
      return NextResponse.json({ error: "No user with that code" }, { status: 404 });
    }
    await prisma.aiUsageLog.create({
      data: { userId: me.id, feature: "invite_code_lookup" },
    }).catch(() => {});
  }

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

  // Same 404 shape for "not found", "deleted", "banned", and
  // "rate-limited" so timing/response-shape comparison can't
  // distinguish valid-but-unavailable codes from genuinely-invalid
  // ones during enumeration probes.
  if (!target || target.deletedAt || target.bannedAt) {
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
