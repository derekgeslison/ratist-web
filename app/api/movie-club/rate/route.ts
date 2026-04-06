import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST — rate the current week's movie */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId, rating, comment } = await req.json();
  if (!weekId || !rating || rating < 1 || rating > 10) {
    return NextResponse.json({ error: "Valid weekId and rating (1-10) required" }, { status: 400 });
  }

  // Verify week is in watching or discussion status
  const week = await prisma.movieClubWeek.findUnique({ where: { id: weekId } });
  if (!week || (week.status !== "watching" && week.status !== "discussion")) {
    return NextResponse.json({ error: "This week is not open for ratings" }, { status: 400 });
  }

  // Must be a member
  const member = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  if (!member) return NextResponse.json({ error: "Join the Movie Club first" }, { status: 403 });

  const clubRating = await prisma.movieClubRating.upsert({
    where: { userId_weekId: { userId: user.id, weekId } },
    create: { userId: user.id, weekId, rating: Number(rating), comment: comment?.trim() || null },
    update: { rating: Number(rating), comment: comment?.trim() || null },
  });

  return NextResponse.json({ rating: clubRating });
}
