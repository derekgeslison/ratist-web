import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — Vote on a poll */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; pollId: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, pollId } = await params;

    // Verify participant
    const participant = await prisma.screeningParticipant.findUnique({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
    });
    if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    const { optionIndex } = await req.json();
    if (typeof optionIndex !== "number") {
      return NextResponse.json({ error: "optionIndex required" }, { status: 400 });
    }

    const poll = await prisma.screeningPoll.findUnique({ where: { id: pollId } });
    if (!poll || poll.sessionId !== id) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    if (poll.closedAt) return NextResponse.json({ error: "Poll is closed" }, { status: 400 });

    const options = poll.options as string[];
    if (optionIndex < 0 || optionIndex >= options.length) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    // Update votes JSON
    const votes = (poll.votes as Record<string, number>) ?? {};
    votes[user.id] = optionIndex;

    const updated = await prisma.screeningPoll.update({
      where: { id: pollId },
      data: { votes },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Vote error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
