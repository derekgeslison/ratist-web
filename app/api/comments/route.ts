import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

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

    // Create notification for the content owner (if not self)
    // For replies, notify the parent comment author
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { userId: true } });
      if (parent && parent.userId !== user.id) {
        await prisma.notification.create({
          data: {
            userId: parent.userId,
            type: "reply",
            actorId: user.id,
            targetType,
            targetId,
            message: `${user.name} replied to your comment`,
          },
        }).catch(() => {}); // non-critical
      }
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
