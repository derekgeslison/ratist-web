import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { checkCommunityRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["discussion", "theory", "poll", "recommendation", "debate"];
const PAGE_SIZE = 20;

async function getUser(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    return prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, isAdmin: true, firebaseUid: true, name: true },
    });
  } catch {
    return null;
  }
}

// GET /api/forum/threads?type=theory&tag=plot-hole&sort=newest&search=inception&tmdbId=123&mediaType=movie&page=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");
    const tag = searchParams.get("tag");
    const sort = searchParams.get("sort") ?? "newest";
    const search = searchParams.get("search");
    const tmdbId = searchParams.get("tmdbId");
    const mediaType = searchParams.get("mediaType");
    const followingOnly = searchParams.get("following") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));

    // Get current user for following filter
    let currentUserId: string | null = null;
    if (followingOnly) {
      const user = await getUser(req);
      currentUserId = user?.id ?? null;
      if (!currentUserId) return NextResponse.json({ threads: [], total: 0 });
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (type && VALID_TYPES.includes(type)) where.threadType = type;
    if (followingOnly && currentUserId) {
      where.followers = { some: { userId: currentUserId } };
    }
    if (tag) where.tags = { some: { tag } };
    const authorId = searchParams.get("authorId");
    if (authorId) where.authorId = authorId;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59");
    }
    if (tmdbId && mediaType) {
      where.media = { some: { tmdbId: Number(tmdbId), mediaType } };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { media: { some: { title: { contains: search, mode: "insensitive" } } } },
        { tags: { some: { tag: { contains: search, mode: "insensitive" } } } },
        { people: { some: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    // Sort
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = [{ isPinned: "desc" }, { createdAt: "desc" }];
    if (sort === "replies") orderBy = [{ isPinned: "desc" }, { posts: { _count: "desc" } }];
    else if (sort === "views") orderBy = [{ isPinned: "desc" }, { viewCount: "desc" }];
    else if (sort === "trending") orderBy = [{ isPinned: "desc" }, { updatedAt: "desc" }]; // most recently active

    const [threads, total] = await Promise.all([
      prisma.forumThread.findMany({
        where,
        include: {
          author: {
            select: {
              id: true, firebaseUid: true, name: true, avatarUrl: true,
              _count: { select: { userBadges: true, ratings: true } },
            },
          },
          opponent: {
            select: { id: true, firebaseUid: true, name: true, avatarUrl: true },
          },
          media: { select: { tmdbId: true, mediaType: true, title: true, posterPath: true } },
          people: { select: { tmdbId: true, name: true, profilePath: true } },
          tags: { select: { tag: true } },
          poll: {
            include: {
              options: {
                include: { _count: { select: { votes: true } } },
                orderBy: { id: "asc" },
                take: 4,
              },
            },
          },
          debateVotes: { select: { side: true } },
          _count: { select: { posts: true } },
          posts: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { content: true },
          },
        },
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.forumThread.count({ where }),
    ]);

    // Batch fetch comment counts from Comment model
    const threadIds = threads.map((t) => t.id);
    const commentCounts = threadIds.length > 0
      ? await prisma.comment.groupBy({
          by: ["targetId"],
          where: { targetType: "forumThread", targetId: { in: threadIds } },
          _count: { id: true },
        })
      : [];
    const commentCountMap = new Map(commentCounts.map((c) => [c.targetId, c._count.id]));

    const enrichedThreads = threads.map((t) => ({
      ...t,
      commentCount: commentCountMap.get(t.id) ?? 0,
      debateVoteCounts: t.threadType === "debate" ? {
        op: t.debateVotes.filter((v: { side: string }) => v.side === "op").length,
        opponent: t.debateVotes.filter((v: { side: string }) => v.side === "opponent").length,
      } : null,
      debateVotes: undefined,
    }));

    return NextResponse.json({
      threads: enrichedThreads,
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (err) {
    console.error("Forum threads GET error:", err);
    return NextResponse.json({ threads: [], total: 0 });
  }
}

// POST /api/forum/threads — create new thread
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimitMsg = await checkCommunityRateLimit(user.id, user.isAdmin, "forumThread");
  if (rateLimitMsg) return NextResponse.json({ error: rateLimitMsg }, { status: 429 });

  const body = await req.json();
  const { threadType, title, content, hasSpoilers, media, people, tags, pollOptions } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }
  if (!threadType || !VALID_TYPES.includes(threadType)) {
    return NextResponse.json({ error: "Invalid thread type" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "Title max 200 characters" }, { status: 400 });
  }
  if (content.length > 10000) {
    return NextResponse.json({ error: "Content max 10,000 characters" }, { status: 400 });
  }

  // Validate media (max 4)
  const mediaItems = Array.isArray(media) ? media.slice(0, 4) : [];
  // Validate tags (max 10)
  const tagItems = Array.isArray(tags)
    ? [...new Set(tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
    : [];
  // Validate poll options
  if (threadType === "poll") {
    if (!Array.isArray(pollOptions) || pollOptions.length < 2 || pollOptions.length > 10) {
      return NextResponse.json({ error: "Polls require 2-10 options" }, { status: 400 });
    }
  }

  // Generate unique slug
  const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const existing = await prisma.forumThread.count({ where: { slug: { startsWith: baseSlug } } });
  const slug = existing > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;

  // Create everything in a transaction
  const thread = await prisma.$transaction(async (tx) => {
    const t = await tx.forumThread.create({
      data: {
        authorId: user.id,
        title: title.trim(),
        slug,
        threadType,
        hasSpoilers: hasSpoilers === true,
      },
    });

    // First post
    await tx.forumPost.create({
      data: { threadId: t.id, authorId: user.id, content: content.trim() },
    });

    // Media links
    for (const m of mediaItems) {
      if (!m.tmdbId || !m.mediaType || !m.title) continue;
      // Try to find existing movie/show in DB for FK
      let movieId: string | null = null;
      let tvShowId: string | null = null;
      if (m.mediaType === "movie") {
        const movie = await tx.movie.findUnique({ where: { tmdbId: m.tmdbId }, select: { id: true } });
        movieId = movie?.id ?? null;
      } else if (m.mediaType === "tv") {
        const show = await tx.tVShow.findUnique({ where: { tmdbId: m.tmdbId }, select: { id: true } });
        tvShowId = show?.id ?? null;
      }
      await tx.forumThreadMedia.create({
        data: {
          threadId: t.id,
          tmdbId: m.tmdbId,
          mediaType: m.mediaType,
          title: m.title,
          posterPath: m.posterPath ?? null,
          movieId,
          tvShowId,
        },
      });
    }

    // People links
    const peopleItems = Array.isArray(people) ? people : [];
    for (const p of peopleItems) {
      if (!p.tmdbId || !p.name) continue;
      const celeb = await tx.celebrity.findUnique({ where: { tmdbId: p.tmdbId }, select: { id: true } });
      await tx.forumThreadPerson.create({
        data: {
          threadId: t.id,
          tmdbId: p.tmdbId,
          name: p.name,
          profilePath: p.profilePath ?? null,
          celebrityId: celeb?.id ?? null,
        },
      });
    }

    // Tags
    for (const tag of tagItems) {
      await tx.forumThreadTag.create({ data: { threadId: t.id, tag } });
    }

    // Poll
    if (threadType === "poll" && Array.isArray(pollOptions)) {
      const poll = await tx.forumPoll.create({ data: { threadId: t.id } });
      for (const label of pollOptions) {
        if (typeof label === "string" && label.trim()) {
          await tx.forumPollOption.create({ data: { pollId: poll.id, label: label.trim() } });
        }
      }
    }

    return t;
  });

  return NextResponse.json({ thread });
}
