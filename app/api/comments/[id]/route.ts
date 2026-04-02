import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ id: string }> }

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** DELETE /api/comments/[id] — delete own comment */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (comment.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.comment.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Comment DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST /api/comments/[id] — toggle like on a comment */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await prisma.commentLike.findUnique({
      where: { userId_commentId: { userId: user.id, commentId: id } },
    });

    if (existing) {
      await prisma.commentLike.delete({
        where: { userId_commentId: { userId: user.id, commentId: id } },
      });
      return NextResponse.json({ liked: false });
    } else {
      await prisma.commentLike.create({
        data: { userId: user.id, commentId: id },
      });
      // Notify comment author (if not self)
      if (comment.userId !== user.id) {
        await prisma.notification.create({
          data: {
            userId: comment.userId,
            type: "comment_like",
            actorId: user.id,
            targetType: comment.targetType,
            targetId: comment.targetId,
            message: `${user.name} liked your comment`,
          },
        }).catch(() => {});
      }
      return NextResponse.json({ liked: true });
    }
  } catch (err) {
    console.error("Comment like error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
