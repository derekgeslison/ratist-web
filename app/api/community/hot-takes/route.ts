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
  try {
    const items = await prisma.hotTake.findMany({
      include: {
        author: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
        votes: { select: { value: true, userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const result = items.map((item) => {
      const score = item.votes.reduce((sum, v) => sum + v.value, 0);
      const { votes, ...rest } = item;
      return { ...rest, score, voterIds: votes.map((v) => ({ userId: v.userId, value: v.value })) };
    }).sort((a, b) => b.score - a.score);

    return NextResponse.json({ items: result });
  } catch (err) {
    console.error("GET hot-takes error:", err);
    return NextResponse.json({ error: "Server error", items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });
  if (content.length > 280) return NextResponse.json({ error: "Max 280 characters" }, { status: 400 });

  const item = await prisma.hotTake.create({
    data: { authorId: user.id, content: content.trim() },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return NextResponse.json({ item: { ...item, score: 0, voterIds: [] } });
}
