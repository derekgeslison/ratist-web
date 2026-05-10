/**
 * Admin queue for invite-code regeneration requests. Mirrors the
 * Feedback / Contact list endpoints — pending-first ordering, full
 * filter so admins can spot-check resolved history when investigating
 * a user.
 *
 * Distinct from /api/admin/invite-codes which is the older direct-
 * admin tool (search any user by code, force-regenerate). This queue
 * is the user-initiated request flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // "pending" | "approved" | "denied" | null (all)

  const requests = await prisma.inviteCodeRequest.findMany({
    where: status ? { status } : undefined,
    // Pending first, then most recent. The status sort puts approved/
    // denied at the bottom alphabetically, which works since pending
    // sorts before both. If a fourth status is added, switch to a
    // CASE-based order or split the queries.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true, inviteCode: true } },
      resolver: { select: { name: true } },
    },
  });

  return NextResponse.json({ requests });
}
