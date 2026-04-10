import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

const VALID_REACTIONS = ["great-take", "mind-blown", "disagree", "funny"];

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

// POST: toggle reaction on a post
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId, reactionType } = await req.json();
  if (!postId || !VALID_REACTIONS.includes(reactionType)) {
    return NextResponse.json({ error: "Invalid postId or reactionType" }, { status: 400 });
  }

  // Toggle: if exists, remove; if not, add
  const existing = await prisma.forumReaction.findFirst({
    where: { postId, userId: user.id, reactionType },
  });

  if (existing) {
    await prisma.forumReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.forumReaction.create({
      data: { postId, userId: user.id, reactionType },
    });
  }

  // Return updated counts for this post
  const reactions = await prisma.forumReaction.findMany({ where: { postId } });
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.reactionType] = (counts[r.reactionType] ?? 0) + 1;
  }
  const userReactions = reactions.filter((r) => r.userId === user.id).map((r) => r.reactionType);

  return NextResponse.json({ counts, userReactions, toggled: !existing });
}
