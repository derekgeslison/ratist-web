import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";

interface Props {
  params: Promise<{ id: string }>;
}

/** DELETE /api/ratings/[id] — delete a review/rating */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rating = await prisma.movieRating.findUnique({ where: { id } });
    if (!rating) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, rating.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Delete associated comments and likes targeting this review
    await prisma.comment.deleteMany({ where: { targetType: "review", targetId: id } });
    await prisma.postLike.deleteMany({ where: { targetType: "review", targetId: id } });

    await prisma.movieRating.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Rating DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
