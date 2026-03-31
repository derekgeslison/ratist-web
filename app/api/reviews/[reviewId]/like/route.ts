import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const { reviewId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Toggle like
    const existing = await prisma.reviewLike.findUnique({
      where: { userId_ratingId: { userId: user.id, ratingId: reviewId } },
    });

    if (existing) {
      await prisma.reviewLike.delete({ where: { id: existing.id } });
      const count = await prisma.reviewLike.count({ where: { ratingId: reviewId } });
      return NextResponse.json({ liked: false, count });
    } else {
      await prisma.reviewLike.create({ data: { userId: user.id, ratingId: reviewId } });
      const count = await prisma.reviewLike.count({ where: { ratingId: reviewId } });
      return NextResponse.json({ liked: true, count });
    }
  } catch (err) {
    console.error("Review like error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
