import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify, checkMilestone, buildReviewLink, buildBlogLink, buildPunchAndJudyLink, buildMovieMapLink } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const VALID_TARGETS = ["review", "blog", "lookslike", "recast", "hottake", "oscar_category"];

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

/** GET /api/comments?targetType=review&targetId=xyz — get threaded comments */
export async function GET(req: NextRequest) {
  try {
    const targetType = req.nextUrl.searchParams.get("targetType");
    const targetId = req.nextUrl.searchParams.get("targetId");
    if (!targetType || !targetId) return NextResponse.json({ comments: [] });

    const user = await getAuthedUser(req);

    const allComments = await prisma.comment.findMany({
      where: { targetType, targetId },
      include: {
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        _count: { select: { likes: true } },
        likes: user ? { where: { userId: user.id }, select: { userId: true } } : undefined,
      },
      orderBy: { createdAt: "asc" },
    });

    // Build threaded structure
    type CommentNode = typeof allComments[0] & { repliesArr: CommentNode[] };
    const commentMap = new Map<string, CommentNode>();
    for (const c of allComments) {
      commentMap.set(c.id, { ...c, repliesArr: [] });
    }

    const roots: CommentNode[] = [];
    for (const c of allComments) {
      const node = commentMap.get(c.id)!;
      if (c.parentId && commentMap.has(c.parentId)) {
        commentMap.get(c.parentId)!.repliesArr.push(node);
      } else {
        roots.push(node);
      }
    }

    function serialize(node: CommentNode): Record<string, unknown> {
      return {
        id: node.id,
        text: node.text,
        parentId: node.parentId,
        createdAt: node.createdAt,
        user: { id: node.user.id, firebaseUid: node.user.firebaseUid, name: node.user.name, avatarUrl: node.user.avatarUrl },
        likeCount: node._count.likes,
        likedByMe: user ? (node.likes?.length ?? 0) > 0 : false,
        replies: node.repliesArr.map(serialize),
      };
    }

    return NextResponse.json({ comments: roots.map(serialize), count: allComments.length });
  } catch (err) {
    console.error("Comments GET error:", err);
    return NextResponse.json({ comments: [], count: 0 });
  }
}

/** POST /api/comments — create a comment or reply */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetType, targetId, parentId, text } = await req.json();
    if (!targetType || !targetId || !text?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!VALID_TARGETS.includes(targetType)) {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }

    // If replying, verify parent exists and belongs to same target
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.targetType !== targetType || parent.targetId !== targetId) {
        return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
      }
    }

    const comment = await prisma.comment.create({
      data: { userId: user.id, targetType, targetId, parentId: parentId || null, text: text.trim() },
      include: { user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } } },
    });

    // Resolve content owner, title, and link for notifications
    let contentOwnerId: string | undefined;
    let contentTitle = "";
    let link: string | undefined;

    if (targetType === "review") {
      const rating = await prisma.movieRating.findUnique({
        where: { id: targetId },
        select: { userId: true, movie: { select: { tmdbId: true, title: true } } },
      });
      if (rating) {
        contentOwnerId = rating.userId;
        contentTitle = rating.movie.title;
        link = buildReviewLink(rating.movie.tmdbId, targetId);
      }
    } else if (targetType === "blog") {
      const post = await prisma.blogPost.findUnique({
        where: { id: targetId },
        select: { authorId: true, slug: true, type: true, title: true },
      });
      if (post) {
        contentOwnerId = post.authorId;
        contentTitle = post.title;
        if (post.type === "PUNCH_AND_JUDY") link = buildPunchAndJudyLink(post.slug);
        else if (post.type === "MOVIE_MAP") link = buildMovieMapLink(post.slug);
        else link = buildBlogLink(post.slug);
      }
    } else if (targetType === "lookslike") {
      const entry = await prisma.looksLike.findUnique({ where: { id: targetId }, select: { creatorId: true, name1: true, name2: true } });
      if (entry) {
        contentOwnerId = entry.creatorId;
        contentTitle = `${entry.name1} & ${entry.name2}`;
        link = "/community/looks-like";
      }
    } else if (targetType === "recast") {
      const entry = await prisma.recast.findUnique({ where: { id: targetId }, select: { creatorId: true, movieTitle: true, characterName: true } });
      if (entry) {
        contentOwnerId = entry.creatorId;
        contentTitle = `${entry.characterName} in ${entry.movieTitle}`;
        link = "/community/recast";
      }
    } else if (targetType === "hottake") {
      const entry = await prisma.hotTake.findUnique({ where: { id: targetId }, select: { authorId: true, content: true } });
      if (entry) {
        contentOwnerId = entry.authorId;
        contentTitle = entry.content.length > 40 ? entry.content.slice(0, 40) + "…" : entry.content;
        link = "/community/hot-takes";
      }
    }

    const titleSuffix = contentTitle ? ` on "${contentTitle}"` : "";

    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { userId: true } });
      if (parent) {
        notify({
          recipientId: parent.userId,
          actorId: user.id,
          type: "reply",
          targetType,
          targetId,
          message: `${user.name} replied to your comment${titleSuffix}`,
          link,
        });
      }
    } else if (contentOwnerId) {
      notify({
        recipientId: contentOwnerId,
        actorId: user.id,
        type: "comment",
        targetType,
        targetId,
        message: `${user.name} commented${titleSuffix}`,
        link,
      });
    }

    return NextResponse.json({
      comment: {
        id: comment.id,
        text: comment.text,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        user: comment.user,
        likeCount: 0,
        likedByMe: false,
        replies: [],
      },
    });
  } catch (err) {
    console.error("Comment POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
