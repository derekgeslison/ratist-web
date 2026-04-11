import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const AUTO_APPROVE_THRESHOLD = 50;

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
}

// GET: list suggestions for a category
export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json({ suggestions: [] });

  const suggestions = await prisma.oscarSuggestion.findMany({
    where: { categoryId, isRejected: false },
    include: {
      suggester: { select: { name: true, firebaseUid: true } },
      _count: { select: { seconds: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get current user's seconds
  const user = await getUser(req);
  let userSeconds: string[] = [];
  if (user) {
    const seconds = await prisma.oscarSuggestionSecond.findMany({
      where: { userId: user.id, suggestionId: { in: suggestions.map((s) => s.id) } },
      select: { suggestionId: true },
    });
    userSeconds = seconds.map((s) => s.suggestionId);
  }

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      tmdbMovieId: s.tmdbMovieId,
      movieTitle: s.movieTitle,
      posterPath: s.posterPath,
      nomineeDetail: s.nomineeDetail,
      isApproved: s.isApproved,
      secondCount: s._count.seconds,
      suggestedBy: s.suggester.name,
      secondedByMe: userSeconds.includes(s.id),
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

// POST: suggest a new nominee or second an existing suggestion
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "suggest") {
    const { categoryId, tmdbMovieId, movieTitle, posterPath, nomineeDetail } = body;
    if (!categoryId || !tmdbMovieId || !movieTitle) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check category exists and year isn't complete
    const category = await prisma.oscarCategory.findUnique({
      where: { id: categoryId },
      include: { oscarYear: { select: { isComplete: true } } },
    });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    if (category.oscarYear.isComplete) return NextResponse.json({ error: "Voting is closed for this year" }, { status: 400 });

    // Check if already an official nominee
    const existingNominee = await prisma.oscarNominee.findFirst({
      where: { categoryId, tmdbMovieId },
    });
    if (existingNominee) return NextResponse.json({ error: "This movie is already nominated in this category" }, { status: 409 });

    // Check if already suggested
    const existingSuggestion = await prisma.oscarSuggestion.findFirst({
      where: { categoryId, tmdbMovieId, nomineeDetail: nomineeDetail ?? null },
    });
    if (existingSuggestion) {
      return NextResponse.json({ error: "This has already been suggested. Second it instead!", existingId: existingSuggestion.id }, { status: 409 });
    }

    const suggestion = await prisma.oscarSuggestion.create({
      data: {
        categoryId,
        suggesterId: user.id,
        tmdbMovieId,
        movieTitle,
        posterPath: posterPath ?? null,
        nomineeDetail: nomineeDetail?.trim() || null,
      },
    });

    // Auto-second by the suggester
    await prisma.oscarSuggestionSecond.create({
      data: { userId: user.id, suggestionId: suggestion.id },
    });

    return NextResponse.json({ suggestion: { id: suggestion.id } });
  }

  if (action === "second") {
    const { suggestionId } = body;
    if (!suggestionId) return NextResponse.json({ error: "Missing suggestionId" }, { status: 400 });

    const suggestion = await prisma.oscarSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        category: { include: { oscarYear: { select: { isComplete: true } } } },
        _count: { select: { seconds: true } },
      },
    });
    if (!suggestion) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    if (suggestion.isApproved) return NextResponse.json({ error: "Already approved" }, { status: 400 });
    if (suggestion.isRejected) return NextResponse.json({ error: "This suggestion was rejected" }, { status: 400 });
    if (suggestion.category.oscarYear.isComplete) return NextResponse.json({ error: "Voting is closed" }, { status: 400 });

    // Check if already seconded
    const existing = await prisma.oscarSuggestionSecond.findUnique({
      where: { userId_suggestionId: { userId: user.id, suggestionId } },
    });
    if (existing) return NextResponse.json({ error: "Already seconded" }, { status: 409 });

    await prisma.oscarSuggestionSecond.create({
      data: { userId: user.id, suggestionId },
    });

    const newCount = suggestion._count.seconds + 1;

    // Check if threshold reached — auto-approve and create nominee
    if (newCount >= AUTO_APPROVE_THRESHOLD && !suggestion.isApproved) {
      await prisma.$transaction(async (tx) => {
        await tx.oscarSuggestion.update({
          where: { id: suggestionId },
          data: { isApproved: true },
        });

        // Create the actual nominee
        await tx.oscarNominee.create({
          data: {
            categoryId: suggestion.categoryId,
            tmdbMovieId: suggestion.tmdbMovieId,
            movieTitle: suggestion.movieTitle,
            posterPath: suggestion.posterPath,
            nomineeDetail: suggestion.nomineeDetail,
          },
        });
      });

      return NextResponse.json({ secondCount: newCount, approved: true });
    }

    return NextResponse.json({ secondCount: newCount, approved: false });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
