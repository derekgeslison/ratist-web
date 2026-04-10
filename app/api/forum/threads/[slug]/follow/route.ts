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

// GET: check if user follows this thread
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ following: false });

  const { slug } = await params;
  const thread = await prisma.forumThread.findUnique({ where: { slug }, select: { id: true } });
  if (!thread) return NextResponse.json({ following: false });

  const follow = await prisma.forumThreadFollow.findUnique({
    where: { userId_threadId: { userId: user.id, threadId: thread.id } },
  });

  return NextResponse.json({ following: !!follow });
}

// POST: toggle follow/unfollow
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const thread = await prisma.forumThread.findUnique({ where: { slug }, select: { id: true } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const existing = await prisma.forumThreadFollow.findUnique({
    where: { userId_threadId: { userId: user.id, threadId: thread.id } },
  });

  if (existing) {
    await prisma.forumThreadFollow.delete({
      where: { userId_threadId: { userId: user.id, threadId: thread.id } },
    });
    return NextResponse.json({ following: false });
  } else {
    await prisma.forumThreadFollow.create({
      data: { userId: user.id, threadId: thread.id },
    });
    return NextResponse.json({ following: true });
  }
}
