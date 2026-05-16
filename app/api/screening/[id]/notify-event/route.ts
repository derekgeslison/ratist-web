import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  notifyScreeningEvent,
  type ScreeningEventKind,
} from "@/lib/screening-room-notify";

export const dynamic = "force-dynamic";

/**
 * Fan-out endpoint for Screening Room push notifications. Called
 * fire-and-forget by the sender's client after they write the
 * underlying event to RTDB (chat message, new poll, pause request).
 *
 * Server checks each member's presence + per-recipient rate limit
 * (see lib/screening-room-notify.ts) and sends FCM/Web Push only
 * to members who are NOT actively in the room. The sender's RTDB
 * write is the source of truth for in-room participants; this
 * endpoint exists purely to reach phones that aren't on the page.
 *
 * Auth: any signed-in participant of the session can call this.
 * Non-members get 403 so a third-party can't trigger pushes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Membership gate. The host can fire events too (e.g. system
    // messages from the host's client), so accept either a
    // participant row or being the host. Non-members can't trigger
    // pushes on a room they aren't in.
    const [participant, session] = await Promise.all([
      prisma.screeningParticipant.findUnique({
        where: { sessionId_userId: { sessionId: id, userId: user.id } },
      }),
      prisma.screeningSession.findUnique({
        where: { id },
        select: { hostId: true },
      }),
    ]);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!participant && session.hostId !== user.id) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as
      | { kind?: unknown; message?: unknown }
      | null;
    const kind = body?.kind;
    const message = typeof body?.message === "string" ? body.message : "";
    if (kind !== "chat" && kind !== "poll" && kind !== "pause") {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Fire-and-forget fan-out. The endpoint returns immediately;
    // the helper handles its own logging and never throws.
    void notifyScreeningEvent({
      sessionId: id,
      kind: kind as ScreeningEventKind,
      senderId: user.id,
      senderName: user.name ?? "Someone",
      message: message.slice(0, 200),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[screening notify-event] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
