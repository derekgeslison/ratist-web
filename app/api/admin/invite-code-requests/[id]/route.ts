/**
 * PATCH a single invite-code request. Action is "approve" or "deny";
 * approve rotates the user's invite code, deny just records the
 * decision. Both fire an in-app notification to the requester.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/screening";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const MAX_NOTES_LEN = 500;

/** Generate a unique 6-char invite code, retrying on collision. The
 *  code space (32^6 ≈ 1B) makes collisions vanishingly rare, but the
 *  loop is cheap insurance against a 1-in-a-billion failed approval. */
async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateInviteCode();
    const existing = await prisma.user.findUnique({ where: { inviteCode: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique invite code after 10 attempts");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthedUser(req);
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes.trim().slice(0, MAX_NOTES_LEN) : null;

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be 'approve' or 'deny'" }, { status: 400 });
  }

  const request = await prisma.inviteCodeRequest.findUnique({
    where: { id },
    include: { user: { select: { id: true, inviteCode: true } } },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
  }

  if (action === "approve") {
    const newCode = await generateUniqueInviteCode();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.userId },
        data: { inviteCode: newCode },
      }),
      prisma.inviteCodeRequest.update({
        where: { id },
        data: {
          status: "approved",
          newCode,
          adminNotes,
          resolvedBy: admin.id,
          resolvedAt: new Date(),
        },
      }),
    ]);

    await notify({
      recipientId: request.userId,
      actorId: null,
      type: "invite_code_approved",
      targetType: "invite_code_request",
      targetId: id,
      message: `Your new invite code is ready: ${newCode}`,
      link: "/settings",
    });

    return NextResponse.json({ ok: true, newCode });
  }

  // deny
  await prisma.inviteCodeRequest.update({
    where: { id },
    data: {
      status: "denied",
      adminNotes,
      resolvedBy: admin.id,
      resolvedAt: new Date(),
    },
  });

  await notify({
    recipientId: request.userId,
    actorId: null,
    type: "invite_code_denied",
    targetType: "invite_code_request",
    targetId: id,
    message: adminNotes
      ? `Your invite code request was denied: ${adminNotes}`
      : "Your invite code request was denied.",
    link: "/settings",
  });

  return NextResponse.json({ ok: true });
}
