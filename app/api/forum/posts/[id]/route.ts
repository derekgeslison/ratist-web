import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
    select: { id: true, isAdmin: true },
  });
}

// PATCH: edit a forum post
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.forumPost.findUnique({
    where: { id },
    include: {
      thread: {
        select: {
          threadType: true, authorId: true, opponentId: true,
          posts: { select: { authorId: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  // Authors can edit their own posts; admins cannot edit other users'
  // posts (only delete/pin/lock via the admin endpoint). Putting words
  // in someone else's mouth is a different power than removing or
  // moderating the thread, and it should never silently happen even
  // from a trusted admin account.
  if (post.authorId !== user.id) {
    return NextResponse.json({ error: "You can only edit your own posts" }, { status: 403 });
  }

  // Debate restriction: can't edit if both sides have 3+ exchanges
  if (post.thread.threadType === "debate") {
    const debatePosts = post.thread.posts.slice(1); // exclude OP post
    const opPosts = debatePosts.filter((p) => p.authorId === post.thread.authorId);
    const challengerPosts = debatePosts.filter((p) => p.authorId === post.thread.opponentId);
    if (opPosts.length >= 3 && challengerPosts.length >= 3) {
      return NextResponse.json({
        error: "Cannot edit posts in a debate with 3+ exchanges each",
      }, { status: 400 });
    }
  }

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });
  if (content.length > 10000) return NextResponse.json({ error: "Content too long" }, { status: 400 });

  const updated = await prisma.forumPost.update({
    where: { id },
    data: { content: content.trim(), isEdited: true },
  });

  return NextResponse.json({ post: updated });
}
