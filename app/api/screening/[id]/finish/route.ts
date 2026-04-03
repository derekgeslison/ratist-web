import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — Mark yourself as finished watching (or host force-finish) */
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
    if (!session.participants.some((p) => p.userId === user.id)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // Undo finish
    if (body.undo) {
      await prisma.screeningParticipant.update({
        where: { sessionId_userId: { sessionId: id, userId: user.id } },
        data: { hasFinished: false },
      });
      return NextResponse.json({ ok: true, allFinished: false });
    }

    // Host can force-finish everyone
    if (body.forceAll && session.hostId === user.id) {
      await prisma.screeningParticipant.updateMany({
        where: { sessionId: id },
        data: { hasFinished: true },
      });
      await prisma.screeningSession.update({
        where: { id },
        data: { status: "POST_WATCH", finishedAt: new Date() },
      });
      return NextResponse.json({ ok: true, allFinished: true });
    }

    // Mark self as finished
    await prisma.screeningParticipant.update({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
      data: { hasFinished: true },
    });

    // Check if everyone is finished
    const participants = await prisma.screeningParticipant.findMany({
      where: { sessionId: id },
    });
    const allFinished = participants.every((p) => p.hasFinished);

    if (allFinished) {
      await prisma.screeningSession.update({
        where: { id },
        data: { status: "POST_WATCH", finishedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, allFinished });
  } catch (err) {
    console.error("Finish screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
