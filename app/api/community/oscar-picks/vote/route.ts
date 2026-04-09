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

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { categoryId, nomineeId } = await req.json();
  if (!categoryId || !nomineeId) {
    return NextResponse.json({ error: "Missing categoryId or nomineeId" }, { status: 400 });
  }

  // Verify nominee belongs to category
  const nominee = await prisma.oscarNominee.findFirst({ where: { id: nomineeId, categoryId } });
  if (!nominee) return NextResponse.json({ error: "Invalid nominee" }, { status: 400 });

  // Verify year is not complete (can't change vote after ceremony)
  const category = await prisma.oscarCategory.findUnique({
    where: { id: categoryId },
    include: { oscarYear: { select: { isComplete: true } } },
  });
  if (category?.oscarYear.isComplete) {
    return NextResponse.json({ error: "Voting closed" }, { status: 400 });
  }

  await prisma.oscarVote.upsert({
    where: { userId_categoryId: { userId: user.id, categoryId } },
    create: { userId: user.id, categoryId, nomineeId },
    update: { nomineeId },
  });

  // Return updated vote counts for this category
  const votes = await prisma.oscarVote.groupBy({
    by: ["nomineeId"],
    where: { categoryId },
    _count: { nomineeId: true },
  });

  checkBadges(user.id, "oscar_vote").catch(() => {});
  return NextResponse.json({ votes: votes.map((v) => ({ nomineeId: v.nomineeId, count: v._count.nomineeId })) });
}
