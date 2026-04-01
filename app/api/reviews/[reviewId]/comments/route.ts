import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const { reviewId } = await params;

    // Check if comments are disabled
    const rating = await prisma.movieRating.findUnique({
      where: { id: reviewId },
      select: { commentsDisabled: true },
    });
    if (rating?.commentsDisabled) return NextResponse.json({ comments: [], disabled: true });

    const comments = await prisma.reviewComment.findMany({
      where: { ratingId: reviewId, parentId: null }, // top-level only
      include: {
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        replies: {
          include: {
            user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments, disabled: false });
  } catch (err) {
    console.error("Comments GET error:", err);
    return NextResponse.json({ comments: [], disabled: false });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const { reviewId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check if comments are disabled
    const rating = await prisma.movieRating.findUnique({
      where: { id: reviewId },
      select: { commentsDisabled: true },
    });
    if (rating?.commentsDisabled) return NextResponse.json({ error: "Comments are disabled on this review" }, { status: 403 });

    const { text, parentId } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "Comment text required" }, { status: 400 });

    const comment = await prisma.reviewComment.create({
      data: {
        userId: user.id,
        ratingId: reviewId,
        parentId: parentId ?? null,
        text: text.trim(),
      },
      include: {
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ comment });
  } catch (err) {
    console.error("Comment POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
