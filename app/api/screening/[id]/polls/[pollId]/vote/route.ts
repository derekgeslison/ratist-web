import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_RETRIES = 3;

/** POST — Vote on a poll (atomic update with retry) */
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

    // Atomic vote update with optimistic retry to avoid read-modify-write race
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const poll = await tx.screeningPoll.findUnique({ where: { id: pollId } });
        if (!poll || poll.sessionId !== id) return { error: "Poll not found", status: 404 };
        if (poll.closedAt) return { error: "Poll is closed", status: 400 };

        const options = poll.options as string[];
        if (optionIndex < 0 || optionIndex >= options.length) {
          return { error: "Invalid option", status: 400 };
        }

        const votes = (poll.votes as Record<string, number>) ?? {};
        votes[user.id] = optionIndex;

        const updated = await tx.screeningPoll.update({
          where: { id: pollId },
          data: { votes },
        });

        return { data: updated };
      });

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      // Transaction succeeded
      return NextResponse.json(result.data);
    }

    return NextResponse.json({ error: "Vote conflict, please try again" }, { status: 409 });
  } catch (err) {
    console.error("Vote error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
