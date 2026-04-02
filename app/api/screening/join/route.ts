import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({ sessionId: session.id, alreadyJoined: true });
    }

    // Add as participant
    await prisma.screeningParticipant.create({
      data: { sessionId: session.id, userId: user.id },
    });

    return NextResponse.json({ sessionId: session.id, alreadyJoined: false }, { status: 201 });
  } catch (err) {
    console.error("Join screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
