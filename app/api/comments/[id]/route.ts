import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser, canDelete } from "@/lib/auth-helpers";
import { notify, checkMilestone } from "@/lib/notifications";

interface Props { params: Promise<{ id: string }> }

/** DELETE /api/comments/[id] — delete own comment or admin delete */
export async function DELETE(req: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canDelete(user, comment.userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

      const snippet = comment.text.length > 50 ? comment.text.slice(0, 50) + "…" : comment.text;

      // Build link to the content where the comment lives
      let link: string | undefined;
      if (comment.targetType === "review") {
        const rating = await prisma.movieRating.findUnique({
          where: { id: comment.targetId },
          select: { movie: { select: { tmdbId: true } } },
        });
        if (rating) link = `/movies/${rating.movie.tmdbId}/reviews/${comment.targetId}`;
      } else if (comment.targetType === "blog") {
        const post = await prisma.blogPost.findUnique({ where: { id: comment.targetId }, select: { slug: true } });
        if (post) link = `/blog/${post.slug}`;
      }

      notify({
        recipientId: comment.userId,
        actorId: user.id,
        type: "comment_like",
        targetType: comment.targetType,
        targetId: comment.targetId,
        message: `${user.name} liked your comment: "${snippet}"`,
        link,
      });

      const likeCount = await prisma.commentLike.count({ where: { commentId: id } });
      checkMilestone({
        contentOwnerId: comment.userId,
        actorId: user.id,
        targetType: comment.targetType,
        targetId: comment.targetId,
        currentCount: likeCount,
        countLabel: "likes",
        contentLabel: "Your comment",
      });

      return NextResponse.json({ liked: true });
    }
  } catch (err) {
    console.error("Comment like error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
