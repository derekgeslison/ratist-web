import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, name: true } });
}

// POST: boot the current challenger from a debate
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const thread = await prisma.forumThread.findUnique({
    where: { slug },
    include: {
      posts: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true } },
    },
  });

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.threadType !== "debate") return NextResponse.json({ error: "Not a debate thread" }, { status: 400 });
  if (thread.authorId !== user.id) return NextResponse.json({ error: "Only the OP can boot a challenger" }, { status: 403 });
  if (!thread.opponentId) return NextResponse.json({ error: "No challenger to boot" }, { status: 400 });

  // Check 12-hour minimum wait since opponent joined
  // Find the first post by the opponent (their join time) or fall back to thread updatedAt
  const opponentPosts = thread.posts.filter((p) => p.authorId === thread.opponentId);
  const opponentFirstPost = opponentPosts[0];

  // If opponent has posted, check exchange count
  // 3 posts each (6 total debate posts, excluding OP's initial post) = no boot allowed
  const debatePosts = thread.posts.slice(1); // exclude OP's initial content post
  const opPosts = debatePosts.filter((p) => p.authorId === thread.authorId);
  const challengerPosts = debatePosts.filter((p) => p.authorId === thread.opponentId);

  if (opPosts.length >= 3 && challengerPosts.length >= 3) {
    return NextResponse.json({
      error: "Cannot boot a challenger after 3+ exchanges each. The debate is too far along.",
    }, { status: 400 });
  }

  // Check 12-hour wait — use the opponent's first post time, or the thread updatedAt if they haven't posted
  const joinTime = opponentFirstPost
    ? new Date(thread.updatedAt) // approximate — when they joined
    : new Date(thread.updatedAt);
  const hoursSinceJoin = (Date.now() - joinTime.getTime()) / (1000 * 60 * 60);

  if (hoursSinceJoin < 12) {
    const hoursLeft = Math.ceil(12 - hoursSinceJoin);
    return NextResponse.json({
      error: `You must wait at least 12 hours before booting a challenger. ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""} remaining.`,
    }, { status: 400 });
  }

  const bootedId = thread.opponentId;

  // Clear everything: remove opponent, delete debate posts (keep OP's initial post),
  // clear votes, add to booted list
  await prisma.$transaction(async (tx) => {
    // Delete all debate posts (posts after the first/OP post)
    const postIdsToDelete = thread.posts.slice(1).map((p) => p.id);
    if (postIdsToDelete.length > 0) {
      await tx.forumPost.deleteMany({ where: { id: { in: postIdsToDelete } } });
    }

    // Clear all debate votes
    await tx.forumDebateVote.deleteMany({ where: { threadId: thread.id } });

    // Reset opponent and add to booted list
    await tx.forumThread.update({
      where: { id: thread.id },
      data: {
        opponentId: null,
        bootedUserIds: { push: bootedId },
      },
    });
  });

  return NextResponse.json({ booted: true });
}
