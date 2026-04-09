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
  const { value } = await req.json();

  if (value !== 1 && value !== -1) {
    return NextResponse.json({ error: "Value must be 1 or -1" }, { status: 400 });
  }

  await prisma.hotTakeVote.upsert({
    where: { userId_hotTakeId: { userId: user.id, hotTakeId: id } },
    create: { userId: user.id, hotTakeId: id, value },
    update: { value },
  });

  const votes = await prisma.hotTakeVote.findMany({ where: { hotTakeId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  const userVote = votes.find((v) => v.userId === user.id)?.value ?? 0;

  const item = await prisma.hotTake.findUnique({ where: { id }, select: { authorId: true } });
  if (item) checkBadges(item.authorId, "hottake_vote").catch(() => {});

  return NextResponse.json({ score, userVote });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.hotTakeVote.deleteMany({ where: { userId: user.id, hotTakeId: id } });
  const votes = await prisma.hotTakeVote.findMany({ where: { hotTakeId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  return NextResponse.json({ score, userVote: 0 });
}
