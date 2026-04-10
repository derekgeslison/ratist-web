import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

// POST: cast a poll vote
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const { optionId } = await req.json();
  if (!optionId) return NextResponse.json({ error: "optionId required" }, { status: 400 });

  // Verify thread is a poll
  const thread = await prisma.forumThread.findUnique({
    where: { slug },
    include: { poll: { include: { options: { select: { id: true } } } } },
  });
  if (!thread || thread.threadType !== "poll" || !thread.poll) {
    return NextResponse.json({ error: "Not a poll thread" }, { status: 400 });
  }

  // Verify option belongs to this poll
  if (!thread.poll.options.some((o) => o.id === optionId)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  // Remove any existing vote for this poll, then cast new one
  await prisma.forumPollVote.deleteMany({
    where: { userId: user.id, option: { pollId: thread.poll.id } },
  });
  await prisma.forumPollVote.create({
    data: { userId: user.id, optionId },
  });

  // Return updated counts
  const options = await prisma.forumPollOption.findMany({
    where: { pollId: thread.poll.id },
    include: { _count: { select: { votes: true } } },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({
    options: options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes })),
    userVote: optionId,
  });
}
