import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

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

  await prisma.moviePitchVote.upsert({
    where: { userId_pitchId: { userId: user.id, pitchId: id } },
    create: { userId: user.id, pitchId: id, value },
    update: { value },
  });

  const votes = await prisma.moviePitchVote.findMany({ where: { pitchId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  const userVote = votes.find((v) => v.userId === user.id)?.value ?? 0;

  return NextResponse.json({ score, userVote });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.moviePitchVote.deleteMany({ where: { userId: user.id, pitchId: id } });
  const votes = await prisma.moviePitchVote.findMany({ where: { pitchId: id } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  return NextResponse.json({ score, userVote: 0 });
}
