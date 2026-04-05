import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { checkCommunityRateLimit } from "@/lib/rate-limit";

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

    const result = items.map((item) => {
      const score = item.votes.reduce((sum, v) => sum + v.value, 0);
      const { votes, ...rest } = item;
      return { ...rest, score, voterIds: votes.map((v) => ({ userId: v.user.firebaseUid, value: v.value })), commentCount: commentMap[item.id] ?? 0 };
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

  return NextResponse.json({ item });
}
