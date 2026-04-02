import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — Create a poll */
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

    const { question, options, revealAt } = await req.json();
    if (!question || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: "Need question and 2+ options" }, { status: 400 });
    }

    const poll = await prisma.screeningPoll.create({
      data: {
        sessionId: id,
        creatorId: user.id,
        question,
        options,
        revealAt: revealAt === "end" ? "end" : "instant",
      },
      include: { creator: { select: { id: true, name: true } } },
    });

    return NextResponse.json(poll, { status: 201 });
  } catch (err) {
    console.error("Create poll error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — List polls */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const polls = await prisma.screeningPoll.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "asc" },
      include: { creator: { select: { id: true, name: true } } },
    });

    return NextResponse.json(polls);
  } catch (err) {
    console.error("List polls error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
