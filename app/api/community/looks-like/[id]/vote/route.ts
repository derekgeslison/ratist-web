import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { checkBadges } from "@/lib/badges";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { value } = await req.json(); // 1 or -1

  if (value !== 1 && value !== -1) {
    return NextResponse.json({ error: "Value must be 1 or -1" }, { status: 400 });
  }

  await prisma.looksLikeVote.upsert({
    where: { userId_looksLikeId: { userId: user.id, looksLikeId: id } },
    create: { userId: user.id, looksLikeId: id, value },
    update: { value },
  });

  const votes = await prisma.looksLikeVote.findMany({ where: { looksLikeId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  const userVote = votes.find((v) => v.userId === user.id)?.value ?? 0;

  // Check badge for the content creator (not the voter)
  const item = await prisma.looksLike.findUnique({ where: { id }, select: { creatorId: true } });
  if (item) checkBadges(item.creatorId, "lookslike_vote").catch(() => {});

  return NextResponse.json({ score, userVote });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.looksLikeVote.deleteMany({
    where: { userId: user.id, looksLikeId: id },
  });

  const votes = await prisma.looksLikeVote.findMany({ where: { looksLikeId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);

  return NextResponse.json({ score, userVote: 0 });
}
