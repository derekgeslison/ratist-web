import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { addParticipantToRtdb } from "@/lib/screening-rtdb";

export const dynamic = "force-dynamic";

/** POST — Join a screening session by invite code */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invite code required" }, { status: 400 });
    }

    const session = await prisma.screeningSession.findUnique({
      where: { inviteCode: code.toUpperCase().trim() },
      include: { participants: true },
    });

    if (!session) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

    if (session.status === "COMPLETE") {
      return NextResponse.json({ error: "Session has ended" }, { status: 400 });
    }

    // Already a participant?
    const already = session.participants.some((p) => p.userId === user.id);
    if (already) {
      // Even on the already-joined path, re-mirror to RTDB in case the
      // RTDB entry has drifted (e.g. participant existed before this
      // mirror existed). Idempotent — set true over true is a no-op.
      await addParticipantToRtdb(session.id, user.firebaseUid);
      return NextResponse.json({ sessionId: session.id, alreadyJoined: true });
    }

    // No-concurrent-rooms gate. Mirrors the create endpoint rule.
    // Excludes THIS session from the lookup so the alreadyJoined
    // short-circuit above stays the only path for re-joins.
    const existingActive = await prisma.screeningSession.findFirst({
      where: {
        id: { not: session.id },
        status: { not: "COMPLETE" },
        OR: [
          { hostId: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      select: { id: true, movieTitle: true, hostId: true },
    });
    if (existingActive) {
      const role = existingActive.hostId === user.id ? "hosting" : "in";
      const label = existingActive.movieTitle ?? "an untitled session";
      return NextResponse.json({
        error: `You're already ${role} another screening room (${label}). ${role === "hosting" ? "End or cancel" : "Leave"} it before joining a new one.`,
        conflictingSessionId: existingActive.id,
      }, { status: 409 });
    }

    // Add as participant
    await prisma.screeningParticipant.create({
      data: { sessionId: session.id, userId: user.id },
    });

    // Mirror membership into RTDB so the database.rules.json gate
    // can identify them as a participant.
    await addParticipantToRtdb(session.id, user.firebaseUid);

    return NextResponse.json({ sessionId: session.id, alreadyJoined: false }, { status: 201 });
  } catch (err) {
    console.error("Join screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
