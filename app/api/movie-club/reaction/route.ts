import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ratingId, value } = await req.json();
  if (!ratingId || !["agree", "disagree"].includes(value)) {
    return NextResponse.json({ error: "ratingId and value (agree/disagree) required" }, { status: 400 });
  }

  // Toggle: if same value, remove. If different, update.
  const existing = await prisma.movieClubReviewReaction.findUnique({
    where: { userId_ratingId: { userId: user.id, ratingId } },
  });

  if (existing && existing.value === value) {
    await prisma.movieClubReviewReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.movieClubReviewReaction.upsert({
      where: { userId_ratingId: { userId: user.id, ratingId } },
      create: { userId: user.id, ratingId, value },
      update: { value },
    });
  }

  const counts = await prisma.movieClubReviewReaction.groupBy({
    by: ["value"],
    where: { ratingId },
    _count: { value: true },
  });
  const results = Object.fromEntries(counts.map((c) => [c.value, c._count.value]));

  // Get user's current reaction
  const userReaction = await prisma.movieClubReviewReaction.findUnique({
    where: { userId_ratingId: { userId: user.id, ratingId } },
  });

  return NextResponse.json({ reactions: results, userReaction: userReaction?.value ?? null });
}
