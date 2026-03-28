import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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

// GET /api/forum/threads/[slug] — fetch thread + posts
export async function GET(_req: NextRequest, { params }: Props) {
  const { slug } = await params;

  const thread = await prisma.forumThread.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true, avatarUrl: true } },
      posts: {
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Increment view count
  await prisma.forumThread.update({
    where: { id: thread.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => null);

  return NextResponse.json({ thread });
}

// POST /api/forum/threads/[slug] — add reply
export async function POST(req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.forumThread.findUnique({ where: { slug } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.isLocked) return NextResponse.json({ error: "Thread is locked" }, { status: 403 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const post = await prisma.forumPost.create({
    data: { threadId: thread.id, authorId: user.id, content: content.trim() },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  // Update thread updatedAt
  await prisma.forumThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ post });
}
