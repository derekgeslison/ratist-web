/**
 * User-facing invite-code regeneration request flow.
 *
 * GET — returns the user's most recent request (pending/approved/denied)
 *       so the settings UI can show appropriate state ("Request pending"
 *       vs "Request new code").
 * POST — creates a pending request, blocked if one already exists.
 *
 * Approval is admin-side: see /api/admin/invite-codes/[id]. The admin
 * approves → server rotates User.inviteCode and sets status=approved
 * with the new code captured for the user's audit trail.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_REASON_LEN = 500;

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await prisma.inviteCodeRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, resolvedAt: true, newCode: true },
  });

  return NextResponse.json({ request: latest });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block duplicates: only one pending request per user at a time. If
  // the previous request was already resolved, a new one is allowed.
  const pending = await prisma.inviteCodeRequest.findFirst({
    where: { userId: user.id, status: "pending" },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { error: "You already have a pending request. An admin will review it shortly." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, MAX_REASON_LEN) : null;

  const created = await prisma.inviteCodeRequest.create({
    data: {
      userId: user.id,
      status: "pending",
      reason: reason && reason.length > 0 ? reason : null,
      // Snapshot the current code so approval has an audit record even
      // if the User row is later mutated independently.
      oldCode: user.inviteCode,
    },
    select: { id: true, status: true, createdAt: true },
  });

  return NextResponse.json({ request: created }, { status: 201 });
}
