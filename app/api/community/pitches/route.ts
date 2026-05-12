import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { checkCommunityRateLimit } from "@/lib/rate-limit";
import { checkBadges } from "@/lib/badges";
import { getCriticUserIds } from "@/lib/critics";
import { postingBlockResponse } from "@/lib/posting-block";
import { maskBlockedInResponse } from "@/lib/safe-content";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, isAdmin: true, firebaseUid: true, name: true, avatarUrl: true } });
}

export async function GET() {
  try {
    const items = await prisma.moviePitch.findMany({
      include: {
        author: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        votes: { select: { value: true, user: { select: { firebaseUid: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const itemIds = items.map((i) => i.id);
    const commentCounts = await prisma.comment.groupBy({
      by: ["targetId"],
      where: { targetType: "pitch", targetId: { in: itemIds } },
      _count: { id: true },
    });
    const commentMap = Object.fromEntries(commentCounts.map((c) => [c.targetId, c._count.id]));

    const criticIds = await getCriticUserIds(items.map((i) => i.author.id));

    const result = items.map((item) => {
      const score = item.votes.reduce((sum, v) => sum + v.value, 0);
      const { votes, author, ...rest } = item;
      return {
        ...rest,
        author: { ...author, isCritic: criticIds.has(author.id) },
        score,
        voterIds: votes.map((v) => ({ userId: v.user.firebaseUid, value: v.value })),
        commentCount: commentMap[item.id] ?? 0,
      };
    }).sort((a, b) => b.score - a.score);

    return NextResponse.json(await maskBlockedInResponse({ items: result }));
  } catch (err) {
    console.error("GET pitches error:", err);
    return NextResponse.json({ error: "Server error", items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blockResp = await postingBlockResponse(user.id);
  if (blockResp) return blockResp;

  const rateLimitMsg = await checkCommunityRateLimit(user.id, user.isAdmin, "moviePitch");
  if (rateLimitMsg) return NextResponse.json({ error: rateLimitMsg }, { status: 429 });

  const { title, description, mediaType, genre } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description required" }, { status: 400 });
  if (title.length > 100) return NextResponse.json({ error: "Title max 100 characters" }, { status: 400 });
  if (description.length > 5000) return NextResponse.json({ error: "Description max 5000 characters" }, { status: 400 });

  const item = await prisma.moviePitch.create({
    data: {
      authorId: user.id,
      title: title.trim(),
      description: description.trim(),
      mediaType: mediaType === "tv" ? "tv" : "movie",
      genre: genre?.trim() || null,
    },
    include: { author: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } } },
  });

  checkBadges(user.id, "pitch_create").catch(() => {});
  return NextResponse.json({ item: { ...item, score: 0, voterIds: [], commentCount: 0 } });
}
