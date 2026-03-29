import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

export async function GET() {
  const items = await prisma.looksLike.findMany({
    include: {
      creator: { select: { name: true } },
      votes: { select: { value: true, userId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const result = items.map((item) => {
    const score = item.votes.reduce((sum, v) => sum + v.value, 0);
    const { votes, ...rest } = item;
    return { ...rest, score, voterIds: votes.map((v) => ({ userId: v.userId, value: v.value })) };
  }).sort((a, b) => b.score - a.score);

  return NextResponse.json({ items: result });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tmdbPersonId1, name1, profilePath1, tmdbPersonId2, name2, profilePath2 } = await req.json();

  if (!tmdbPersonId1 || !tmdbPersonId2 || !name1 || !name2) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (tmdbPersonId1 === tmdbPersonId2) {
    return NextResponse.json({ error: "Must be two different people" }, { status: 400 });
  }

  // Normalize: always store with lower id first to avoid duplicates
  const [id1, n1, p1, id2, n2, p2] = tmdbPersonId1 < tmdbPersonId2
    ? [tmdbPersonId1, name1, profilePath1, tmdbPersonId2, name2, profilePath2]
    : [tmdbPersonId2, name2, profilePath2, tmdbPersonId1, name1, profilePath1];

  try {
    const item = await prisma.looksLike.create({
      data: {
        creatorId: user.id,
        tmdbPersonId1: id1,
        name1: n1,
        profilePath1: p1 ?? null,
        tmdbPersonId2: id2,
        name2: n2,
        profilePath2: p2 ?? null,
      },
    });
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "This pair already exists" }, { status: 409 });
  }
}
