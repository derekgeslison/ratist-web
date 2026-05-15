import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { removeParticipantFromRtdb } from "@/lib/screening-rtdb";

export const dynamic = "force-dynamic";

/** POST — Leave a screening session (non-host only) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Host can't leave — they should cancel/delete instead
    if (session.hostId === user.id) {
      return NextResponse.json({ error: "Host cannot leave. Cancel the session instead." }, { status: 400 });
    }

    // Must be a participant
    if (!session.participants.some((p) => p.userId === user.id)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    // Remove participant
    await prisma.screeningParticipant.delete({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
    });

    // Also clean up their prediction if any
    await prisma.screeningPrediction.deleteMany({
      where: { sessionId: id, userId: user.id },
    });

    // Drop their membership from the RTDB mirror so the database.rules
    // gate stops allowing read/write to this session for them.
    await removeParticipantFromRtdb(id, user.firebaseUid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Leave screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
