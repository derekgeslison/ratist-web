import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { checkCommunityRateLimit } from "@/lib/rate-limit";
import { checkBadges } from "@/lib/badges";
import { getCriticUserIds } from "@/lib/critics";
import { postingBlockResponse } from "@/lib/posting-block";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, isAdmin: true, firebaseUid: true, name: true } });
}

export async function GET() {
  try {
    const items = await prisma.recast.findMany({
      include: {
        creator: { select: { name: true, firebaseUid: true } },
        votes: { select: { value: true, user: { select: { firebaseUid: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const itemIds = items.map((i) => i.id);
    const commentCounts = await prisma.comment.groupBy({
      by: ["targetId"],
      where: { targetType: "recast", targetId: { in: itemIds } },
      _count: { id: true },
    });
    const commentMap = Object.fromEntries(commentCounts.map((c) => [c.targetId, c._count.id]));

    const criticIds = await getCriticUserIds(items.map((i) => i.creatorId));

    const result = items.map((item) => {
      const score = item.votes.reduce((sum, v) => sum + v.value, 0);
      const { votes, creator, ...rest } = item;
      return {
        ...rest,
        creator: { ...creator, isCritic: criticIds.has(item.creatorId) },
        score,
        voterIds: votes.map((v) => ({ userId: v.user.firebaseUid, value: v.value })),
        commentCount: commentMap[item.id] ?? 0,
      };
    }).sort((a, b) => b.score - a.score);

    return NextResponse.json({ items: result });
  } catch (err) {
    console.error("GET recast error:", err);
    return NextResponse.json({ error: "Server error", items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blockResp = await postingBlockResponse(user.id);
  if (blockResp) return blockResp;

  const rateLimitMsg = await checkCommunityRateLimit(user.id, user.isAdmin, "recast");
  if (rateLimitMsg) return NextResponse.json({ error: rateLimitMsg }, { status: 429 });

  const {
    tmdbMovieId, movieTitle, posterPath,
    characterName, originalActorName, originalActorTmdbId,
    suggestedActorName, suggestedActorTmdbId, suggestedActorProfile,
  } = await req.json();

  if (!tmdbMovieId || !movieTitle || !characterName || !originalActorName || !suggestedActorName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check for duplicate: same movie + character + suggested actor
  const existing = await prisma.recast.findFirst({
    where: {
      tmdbMovieId,
      characterName: { equals: characterName, mode: "insensitive" },
      suggestedActorName: { equals: suggestedActorName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "This recast has already been submitted!", existingId: existing.id }, { status: 409 });
  }

  const item = await prisma.recast.create({
    data: {
      creatorId: user.id,
      tmdbMovieId,
      movieTitle,
      posterPath: posterPath ?? null,
      characterName,
      originalActorName,
      originalActorTmdbId: originalActorTmdbId ?? null,
      suggestedActorName,
      suggestedActorTmdbId: suggestedActorTmdbId ?? null,
      suggestedActorProfile: suggestedActorProfile ?? null,
    },
  });

  checkBadges(user.id, "recast_create").catch(() => {});
  return NextResponse.json({ item });
}
