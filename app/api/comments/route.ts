import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify, checkMilestone, buildReviewLink, buildBlogLink, buildTwoThumbsLink, buildMovieMapLink } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const VALID_TARGETS = ["review", "blog", "news", "lookslike", "recast", "hottake", "oscar_category", "pitch", "movieclub", "movieclub_prompt", "forumThread"];

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

    // Resolve content owner, title, label, and link for notifications
    let contentOwnerId: string | undefined;
    let notifMessage = "";
    let replyMessage = "";
    let link: string | undefined;
    let skipOwnerNotify = false; // blog/P&J/movie-map authors don't need notifications

    if (targetType === "review") {
      const rating = await prisma.movieRating.findUnique({
        where: { id: targetId },
        select: { userId: true, movie: { select: { tmdbId: true, title: true } } },
      });
      if (rating) {
        contentOwnerId = rating.userId;
        link = buildReviewLink(rating.movie.tmdbId, targetId);
        notifMessage = `${user.name} commented on your "${rating.movie.title}" review`;
        replyMessage = `${user.name} replied to your comment on the "${rating.movie.title}" review`;
      }
    } else if (targetType === "blog") {
      const post = await prisma.blogPost.findUnique({
        where: { id: targetId },
        select: { authorId: true, slug: true, type: true, title: true },
      });
      if (post) {
        contentOwnerId = post.authorId;
        skipOwnerNotify = true; // admins don't need comment notifications on their posts
        if (post.type === "PUNCH_AND_JUDY") link = buildTwoThumbsLink(post.slug);
        else if (post.type === "MOVIE_MAP") link = buildMovieMapLink(post.slug);
        else link = buildBlogLink(post.slug);
        replyMessage = `${user.name} replied to your comment on "${post.title}"`;
      }
    } else if (targetType === "lookslike") {
      const entry = await prisma.looksLike.findUnique({ where: { id: targetId }, select: { creatorId: true, name1: true, name2: true } });
      if (entry) {
        contentOwnerId = entry.creatorId;
        link = "/community/looks-like";
        notifMessage = `${user.name} commented on your "${entry.name1} & ${entry.name2}" Looks Like submission`;
        replyMessage = `${user.name} replied to your comment on the "${entry.name1} & ${entry.name2}" Looks Like submission`;
      }
    } else if (targetType === "recast") {
      const entry = await prisma.recast.findUnique({ where: { id: targetId }, select: { creatorId: true, movieTitle: true, characterName: true, suggestedActorName: true } });
      if (entry) {
        contentOwnerId = entry.creatorId;
        link = "/community/recast";
        notifMessage = `${user.name} commented on your "${entry.characterName} in ${entry.movieTitle}" Recast submission`;
        replyMessage = `${user.name} replied to your comment on the "${entry.characterName} in ${entry.movieTitle}" Recast`;
      }
    } else if (targetType === "hottake") {
      const entry = await prisma.hotTake.findUnique({ where: { id: targetId }, select: { authorId: true, content: true } });
      if (entry) {
        contentOwnerId = entry.authorId;
        link = "/community/hot-takes";
        const snippet = entry.content.length > 50 ? entry.content.slice(0, 50) + "…" : entry.content;
        notifMessage = `${user.name} commented on your "${snippet}" Hot Take`;
        replyMessage = `${user.name} replied to your comment on the "${snippet}" Hot Take`;
      }
    } else if (targetType === "oscar_category") {
      replyMessage = `${user.name} replied to your comment in Oscar Picks`;
      link = "/community/oscar-picks";
    } else if (targetType === "forumThread") {
      const thread = await prisma.forumThread.findUnique({
        where: { id: targetId },
        select: { authorId: true, title: true, slug: true },
      });
      if (thread) {
        contentOwnerId = thread.authorId;
        link = `/forum/t/${thread.slug}`;
        const snippet = thread.title.length > 50 ? thread.title.slice(0, 50) + "…" : thread.title;
        notifMessage = `${user.name} commented on your thread "${snippet}"`;
        replyMessage = `${user.name} replied to your comment on "${snippet}"`;
      }
    }

    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { userId: true } });
      if (parent && replyMessage) {
        notify({
          recipientId: parent.userId,
          actorId: user.id,
          type: "reply",
          targetType,
          targetId,
          message: replyMessage,
          link,
        });
      }
    } else if (contentOwnerId && notifMessage && !skipOwnerNotify) {
      notify({
        recipientId: contentOwnerId,
        actorId: user.id,
        type: "comment",
        targetType,
        targetId,
        message: notifMessage,
        link,
      });
    }

    // Notify thread followers (forumThread only, max 1 per 12h per follower per thread)
    if (targetType === "forumThread" && link) {
      try {
        const followers = await prisma.forumThreadFollow.findMany({
          where: { threadId: targetId },
          select: { userId: true },
        });
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        for (const follower of followers) {
          // Skip the commenter, the content owner (already notified), and the parent comment author (already notified)
          if (follower.userId === user.id) continue;
          if (follower.userId === contentOwnerId) continue;
          if (parentId) {
            const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { userId: true } });
            if (parent && follower.userId === parent.userId) continue;
          }
          // Check 12-hour cooldown for this follower on this thread
          const recent = await prisma.notification.findFirst({
            where: {
              userId: follower.userId,
              type: "comment",
              targetType: "forumThread",
              targetId,
              createdAt: { gte: twelveHoursAgo },
            },
          });
          if (!recent) {
            const thread2 = await prisma.forumThread.findUnique({ where: { id: targetId }, select: { title: true } });
            const threadTitle = thread2?.title ?? "a thread";
            const titleSnippet = threadTitle.length > 60 ? threadTitle.slice(0, 60) + "…" : threadTitle;
            await prisma.notification.create({
              data: {
                userId: follower.userId,
                type: "comment",
                actorId: user.id,
                targetType: "forumThread",
                targetId,
                message: `New activity on "${titleSnippet}"`,
                link,
              },
            });
          }
        }
      } catch { /* non-critical */ }
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
