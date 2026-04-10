import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getUser(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  } catch {
    return null;
  }
}

// GET /api/forum/threads/[slug] — fetch thread + posts with enriched data
export async function GET(req: NextRequest, { params }: Props) {
  const { slug } = await params;

  const thread = await prisma.forumThread.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          id: true, firebaseUid: true, name: true, avatarUrl: true,
          _count: { select: { userBadges: true, ratings: true } },
        },
      },
      opponent: {
        select: { id: true, firebaseUid: true, name: true, avatarUrl: true },
      },
      media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
      people: { select: { tmdbId: true, name: true, profilePath: true } },
      tags: { select: { tag: true } },
      poll: {
        include: {
          options: {
            include: { _count: { select: { votes: true } } },
            orderBy: { id: "asc" },
          },
        },
      },
      debateVotes: { select: { side: true } },
      posts: {
        include: {
          author: {
            select: {
              id: true, firebaseUid: true, name: true, avatarUrl: true,
              _count: { select: { userBadges: true, ratings: true } },
            },
          },
          reactions: { select: { reactionType: true, userId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Increment view count (fire-and-forget)
  prisma.forumThread.update({
    where: { id: thread.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => null);

  // Get current user's poll vote if applicable
  let userPollVote: string | null = null;
  let userDebateVote: string | null = null;
  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
      const viewer = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
      if (viewer) {
        if (thread.poll) {
          const vote = await prisma.forumPollVote.findFirst({
            where: { userId: viewer.id, option: { pollId: thread.poll.id } },
            select: { optionId: true },
          });
          userPollVote = vote?.optionId ?? null;
        }
        if (thread.threadType === "debate") {
          const dv = await prisma.forumDebateVote.findUnique({
            where: { userId_threadId: { userId: viewer.id, threadId: thread.id } },
            select: { side: true },
          });
          userDebateVote = dv?.side ?? null;
        }
      }
    } catch { /* not logged in */ }
  }

  // Aggregate debate votes
  const debateVoteCounts = thread.threadType === "debate" ? {
    op: thread.debateVotes.filter((v) => v.side === "op").length,
    opponent: thread.debateVotes.filter((v) => v.side === "opponent").length,
  } : null;

  // Aggregate reactions per post
  const postsWithAggregatedReactions = thread.posts.map((post) => {
    const reactionCounts: Record<string, number> = {};
    const userReactions: string[] = [];
    for (const r of post.reactions) {
      reactionCounts[r.reactionType] = (reactionCounts[r.reactionType] ?? 0) + 1;
    }
    return {
      ...post,
      reactionCounts,
      userReactions,
      reactions: undefined, // don't send raw reactions
    };
  });

  return NextResponse.json({
    thread: {
      ...thread,
      posts: postsWithAggregatedReactions,
      debateVotes: undefined,
      debateVoteCounts,
    },
    userPollVote,
    userDebateVote,
  });
}

// POST /api/forum/threads/[slug] — add reply
export async function POST(req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.forumThread.findUnique({
    where: { slug },
    include: { posts: { orderBy: { createdAt: "desc" }, take: 1, select: { authorId: true } } },
  });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.isLocked) return NextResponse.json({ error: "Thread is locked" }, { status: 403 });

  // Debate thread: enforce alternating turns
  if (thread.threadType === "debate" && thread.opponentId) {
    const isOP = user.id === thread.authorId;
    const isOpponent = user.id === thread.opponentId;
    if (!isOP && !isOpponent) {
      return NextResponse.json({ error: "Only the two debaters can post in a debate thread" }, { status: 403 });
    }
    const lastPost = thread.posts[0];
    if (lastPost && lastPost.authorId === user.id) {
      return NextResponse.json({ error: "Wait for your opponent to reply" }, { status: 400 });
    }
  }

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });
  if (content.length > 5000) return NextResponse.json({ error: "Reply max 5,000 characters" }, { status: 400 });

  const post = await prisma.forumPost.create({
    data: { threadId: thread.id, authorId: user.id, content: content.trim() },
    include: {
      author: {
        select: {
          id: true, firebaseUid: true, name: true, avatarUrl: true,
          _count: { select: { userBadges: true, ratings: true } },
        },
      },
    },
  });

  // Update thread updatedAt
  await prisma.forumThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ post });
}

/** DELETE /api/forum/threads/[slug] — delete a forum thread */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { slug } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const thread = await prisma.forumThread.findUnique({ where: { slug } });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, thread.authorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.forumThread.delete({ where: { id: thread.id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("ForumThread DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
