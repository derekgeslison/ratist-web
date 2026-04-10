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

// POST: vote on which debater won
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const { side } = await req.json();
  if (side !== "op" && side !== "opponent") {
    return NextResponse.json({ error: "side must be 'op' or 'opponent'" }, { status: 400 });
  }

  const thread = await prisma.forumThread.findUnique({ where: { slug } });
  if (!thread || thread.threadType !== "debate") {
    return NextResponse.json({ error: "Not a debate thread" }, { status: 400 });
  }

  // Debaters can't vote on their own debate
  if (user.id === thread.authorId || user.id === thread.opponentId) {
    return NextResponse.json({ error: "Debaters cannot vote on their own debate" }, { status: 400 });
  }

  // Upsert vote
  await prisma.forumDebateVote.upsert({
    where: { userId_threadId: { userId: user.id, threadId: thread.id } },
    create: { userId: user.id, threadId: thread.id, side },
    update: { side },
  });

  // Return updated counts
  const votes = await prisma.forumDebateVote.findMany({ where: { threadId: thread.id } });
  return NextResponse.json({
    op: votes.filter((v) => v.side === "op").length,
    opponent: votes.filter((v) => v.side === "opponent").length,
    userVote: side,
  });
}
