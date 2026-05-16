import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify, checkMilestone, buildReviewLink, buildBlogLink, buildTwoThumbsLink, buildMovieMapLink, getCommentTargetLink } from "@/lib/notifications";
import { postingBlockResponse } from "@/lib/posting-block";
import { getMutualBlockedIds } from "@/lib/blocks";

export const dynamic = "force-dynamic";

const VALID_TARGETS = ["review", "blog", "news", "lookslike", "recast", "hottake", "oscar_category", "pitch", "movieclub", "movieclub_prompt", "forumThread", "collection"];

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

    // Pull mutual-blocks ONCE per request and use it to drop comments
    // by users the viewer (or their blockers) shouldn't see. We do this
    // at the row-fetch level via a `userId not in [...]` filter rather
    // than post-fetch so a thread with 200 comments where 50 are by
    // blocked users doesn't waste payload + render cycles.
    //
    // Replies stay visible if their author isn't blocked even if the
    // parent author is — the post-fetch tree-build below skips orphans
    // (parentId not in commentMap) naturally, which keeps thread
    // structure sane.
    const blockedIds = await getMutualBlockedIds(user?.id);

    const allComments = await prisma.comment.findMany({
      where: {
        targetType,
        targetId,
        ...(blockedIds.size > 0 ? { userId: { notIn: [...blockedIds] } } : {}),
      },
      include: {
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        _count: { select: { likes: true } },
        likes: user ? { where: { userId: user.id }, select: { userId: true } } : undefined,
        // The linked collection is what powers the "reply with your own list"
        // mini-tile. Pull a minimal poster preview here so the GET fully
        // hydrates the comment thread without per-comment N+1 fetches on
        // the client.
        linkedCollection: {
          select: {
            id: true,
            name: true,
            slug: true,
            visibility: true,
            user: { select: { firebaseUid: true, name: true } },
            items: { orderBy: { sortOrder: "asc" }, take: 4, select: { posterPath: true } },
            _count: { select: { items: true } },
          },
        },
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
      // Linked collection only renders if it's still public — a curator
      // who unpublishes shouldn't have their old draft revealed via stale
      // mini-tiles in other people's comments.
      const lc = node.linkedCollection && node.linkedCollection.visibility === "public" && node.linkedCollection.slug
        ? {
            id: node.linkedCollection.id,
            name: node.linkedCollection.name,
            slug: node.linkedCollection.slug,
            curator: {
              firebaseUid: node.linkedCollection.user.firebaseUid,
              name: node.linkedCollection.user.name,
            },
            previewPosters: node.linkedCollection.items.map((i) => i.posterPath).filter(Boolean) as string[],
            itemCount: node.linkedCollection._count.items,
          }
        : null;
      return {
        id: node.id,
        text: node.text,
        gifUrl: node.gifUrl,
        parentId: node.parentId,
        createdAt: node.createdAt,
        user: { id: node.user.id, firebaseUid: node.user.firebaseUid, name: node.user.name, avatarUrl: node.user.avatarUrl },
        likeCount: node._count.likes,
        likedByMe: user ? (node.likes?.length ?? 0) > 0 : false,
        linkedCollection: lc,
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

    const blockResp = await postingBlockResponse(user.id);
    if (blockResp) return blockResp;

    const { targetType, targetId, parentId, text, gifUrl, linkedCollectionId: rawLinkedCollectionId } = await req.json();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!VALID_TARGETS.includes(targetType)) {
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }

    // Comments on collections require the target to be public — a private
    // collection isn't reachable from the community feed, so a comment on
    // one would either be inaccessible or leak the curator's draft.
    if (targetType === "collection") {
      const target = await prisma.customCollection.findUnique({
        where: { id: targetId },
        select: { visibility: true },
      });
      if (!target || target.visibility !== "public") {
        return NextResponse.json({ error: "Collection is not public." }, { status: 404 });
      }
    }

    // Linked-collection embed ("reply with your own list"). Validate the
    // referenced collection exists, is public, and is owned by the
    // commenter — pasting a link to someone else's collection should go
    // through plain text, not the official embed surface.
    let linkedCollectionId: string | null = null;
    if (typeof rawLinkedCollectionId === "string" && rawLinkedCollectionId.length > 0) {
      const linked = await prisma.customCollection.findUnique({
        where: { id: rawLinkedCollectionId },
        select: { id: true, userId: true, visibility: true },
      });
      if (!linked || linked.visibility !== "public") {
        return NextResponse.json({ error: "Linked collection is not public." }, { status: 400 });
      }
      if (linked.userId !== user.id) {
        return NextResponse.json({ error: "You can only link your own collections." }, { status: 400 });
      }
      linkedCollectionId = linked.id;
    }

    // GIF picker only — comments may now be GIF-only, text-only, or both,
    // but at least one has to be present.
    const trimmedText = typeof text === "string" ? text.trim() : "";
    // Validate gifUrl if provided: must be a giphy.com URL. Stops users
    // from stuffing arbitrary URLs (potentially nasty image hosts) into
    // the field via direct API calls.
    let safeGifUrl: string | null = null;
    if (typeof gifUrl === "string" && gifUrl.length > 0) {
      try {
        const u = new URL(gifUrl);
        if (u.protocol === "https:" && u.hostname.endsWith(".giphy.com")) {
          safeGifUrl = gifUrl;
        }
      } catch { /* invalid URL — drop silently */ }
    }
    // A linked collection is content on its own (the embed renders without
    // text or a GIF), so it satisfies the "must have something" check.
    if (!trimmedText && !safeGifUrl && !linkedCollectionId) {
      return NextResponse.json({ error: "Add some text, a GIF, or attach a collection" }, { status: 400 });
    }

    // If replying, verify parent exists and belongs to same target
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.targetType !== targetType || parent.targetId !== targetId) {
        return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        userId: user.id,
        targetType,
        targetId,
        parentId: parentId || null,
        text: trimmedText,
        gifUrl: safeGifUrl,
        linkedCollectionId,
      },
      include: {
        user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        // Always include the linked-collection select so the response
        // shape is stable. When linkedCollectionId is null Prisma returns
        // linkedCollection: null without the join cost. Conditional
        // includes confuse Prisma's type inference.
        linkedCollection: {
          select: {
            id: true,
            name: true,
            slug: true,
            visibility: true,
            user: { select: { firebaseUid: true, name: true } },
            items: { orderBy: { sortOrder: "asc" }, take: 4, select: { posterPath: true } },
            _count: { select: { items: true } },
          },
        },
      },
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
    } else if (targetType === "collection") {
      const c = await prisma.customCollection.findUnique({
        where: { id: targetId },
        select: { userId: true, name: true, slug: true, user: { select: { firebaseUid: true } } },
      });
      if (c?.slug) {
        contentOwnerId = c.userId;
        link = `/collections/${c.user.firebaseUid}/${c.slug}`;
        const snippet = c.name.length > 50 ? c.name.slice(0, 50) + "…" : c.name;
        notifMessage = `${user.name} commented on your collection "${snippet}"`;
        replyMessage = `${user.name} replied to your comment on "${snippet}"`;
      }
    }

    // Override the per-branch link with one that anchors to the new
    // comment (so clicking the notification scrolls right to it). The
    // helper also fills in news/pitch/movieclub which the if/else above
    // doesn't cover, so notifications on those targets go from
    // unclickable text to a real link. Falls back to the per-branch
    // link if the helper can't resolve (deleted target row, etc.).
    const anchoredLink = await getCommentTargetLink(targetType, targetId, { commentId: comment.id });
    if (anchoredLink) link = anchoredLink;

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

    // Build the linked-collection tile shape that the client renders. Match
    // the GET serializer so optimistic inserts look identical to a refetch.
    const lc = comment.linkedCollection && comment.linkedCollection.visibility === "public" && comment.linkedCollection.slug
      ? {
          id: comment.linkedCollection.id,
          name: comment.linkedCollection.name,
          slug: comment.linkedCollection.slug,
          curator: {
            firebaseUid: comment.linkedCollection.user.firebaseUid,
            name: comment.linkedCollection.user.name,
          },
          previewPosters: comment.linkedCollection.items.map((i) => i.posterPath).filter(Boolean) as string[],
          itemCount: comment.linkedCollection._count.items,
        }
      : null;

    return NextResponse.json({
      comment: {
        id: comment.id,
        text: comment.text,
        gifUrl: comment.gifUrl,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        user: comment.user,
        likeCount: 0,
        likedByMe: false,
        linkedCollection: lc,
        replies: [],
      },
    });
  } catch (err) {
    console.error("Comment POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
