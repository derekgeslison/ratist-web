import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

// GET /api/forum/threads?categorySlug=general
export async function GET(req: NextRequest) {
  try {
    const categorySlug = req.nextUrl.searchParams.get("categorySlug");
    const where = categorySlug
      ? { category: { slug: categorySlug } }
      : {};

    const threads = await prisma.forumThread.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        category: { select: { name: true, slug: true } },
        _count: { select: { posts: true } },
        posts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { name: true } } },
        },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ threads });
  } catch {
    return NextResponse.json({ threads: [] });
  }
}

// POST /api/forum/threads — create new thread
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { categoryId, title, content } = await req.json();
  if (!categoryId || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Generate unique slug from title
  const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const existing = await prisma.forumThread.count({ where: { slug: { startsWith: baseSlug } } });
  const slug = existing > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;

  const thread = await prisma.forumThread.create({
    data: {
      categoryId,
      authorId: user.id,
      title: title.trim(),
      slug,
    },
  });

  // First post is the thread body
  await prisma.forumPost.create({
    data: {
      threadId: thread.id,
      authorId: user.id,
      content: content.trim(),
    },
  });

  return NextResponse.json({ thread });
}
