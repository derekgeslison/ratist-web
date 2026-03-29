import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ slug: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { slug } = await params;
    const post = await prisma.blogPost.findUnique({ where: { slug, published: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const { content } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    if (content.trim().length > 2000) return NextResponse.json({ error: "Comment too long" }, { status: 400 });

    const comment = await prisma.blogComment.create({
      data: { postId: post.id, authorId: user.id, content: content.trim() },
      include: { author: { select: { name: true, avatarUrl: true } } },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error("Comment error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
