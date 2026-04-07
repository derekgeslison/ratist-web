import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST — submit a review for this week's movie */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { weekId, rating, reviewText, reviewType, isRewatch } = body;
  if (!weekId || !rating || rating < 1 || rating > 10) {
    return NextResponse.json({ error: "Valid weekId and rating (1-10) required" }, { status: 400 });
  }

  const week = await prisma.movieClubWeek.findUnique({ where: { id: weekId } });
  if (!week || (week.status !== "watching" && week.status !== "discussion")) {
    return NextResponse.json({ error: "This week is not open for reviews" }, { status: 400 });
  }

  const member = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  if (!member) return NextResponse.json({ error: "Join the Movie Club first" }, { status: 403 });

  // Check if this is a rewatch (user already had the movie marked as seen)
  let detectedRewatch = isRewatch ?? false;
  if (week.movieId) {
    const alreadySeen = await prisma.userFavoriteMovie.findUnique({
      where: { userId_movieId: { userId: user.id, movieId: week.movieId } },
    });
    if (alreadySeen) detectedRewatch = true;
  }

  // Store the full form data (all rubric scores) for prefilling the official review later
  const formData = { ...body };
  delete formData.weekId;
  delete formData.isRewatch;

  const clubRating = await prisma.movieClubRating.upsert({
    where: { userId_weekId: { userId: user.id, weekId } },
    create: {
      userId: user.id, weekId,
      rating: Number(rating),
      reviewText: reviewText?.trim() || null,
      reviewType: reviewType ?? "quick",
      formData,
      isRewatch: detectedRewatch,
    },
    update: {
      rating: Number(rating),
      reviewText: reviewText?.trim() || null,
      reviewType: reviewType ?? "quick",
      formData,
      isRewatch: detectedRewatch,
    },
  });

  return NextResponse.json({ rating: clubRating });
}
