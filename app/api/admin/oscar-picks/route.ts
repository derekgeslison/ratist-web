import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// POST: create oscar year with categories + nominees
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, ...body } = await req.json();

  if (action === "create-year") {
    const { year, ceremonyDate } = body;
    const oscarYear = await prisma.oscarYear.create({
      data: { year, ceremonyDate: ceremonyDate ? new Date(ceremonyDate) : null },
    });
    return NextResponse.json({ oscarYear });
  }

  if (action === "add-category") {
    const { oscarYearId, name, slug, sortOrder } = body;
    const category = await prisma.oscarCategory.create({
      data: { oscarYearId, name, slug, sortOrder: sortOrder ?? 0 },
    });
    return NextResponse.json({ category });
  }

  if (action === "add-nominee") {
    const { categoryId, tmdbMovieId, movieTitle, posterPath, nomineeDetail } = body;
    const nominee = await prisma.oscarNominee.create({
      data: { categoryId, tmdbMovieId, movieTitle, posterPath, nomineeDetail },
    });
    return NextResponse.json({ nominee });
  }

  if (action === "mark-winner") {
    const { nomineeId } = body;
    const nominee = await prisma.oscarNominee.findUnique({ where: { id: nomineeId }, include: { category: true } });
    if (!nominee) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Clear other winners in this category
    await prisma.oscarNominee.updateMany({ where: { categoryId: nominee.categoryId }, data: { isWinner: false } });
    await prisma.oscarNominee.update({ where: { id: nomineeId }, data: { isWinner: true } });
    return NextResponse.json({ ok: true });
  }

  if (action === "close-year") {
    const { oscarYearId } = body;
    await prisma.oscarYear.update({ where: { id: oscarYearId }, data: { isComplete: true } });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve-suggestion") {
    const { suggestionId } = body;
    const suggestion = await prisma.oscarSuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.oscarSuggestion.update({ where: { id: suggestionId }, data: { isApproved: true } });
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
    return NextResponse.json({ ok: true });
  }

  if (action === "reject-suggestion") {
    const { suggestionId } = body;
    await prisma.oscarSuggestion.update({ where: { id: suggestionId }, data: { isRejected: true } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const years = await prisma.oscarYear.findMany({
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          nominees: true,
          _count: { select: { votes: true } },
          suggestions: {
            where: { isApproved: false, isRejected: false },
            include: {
              suggester: { select: { name: true } },
              _count: { select: { seconds: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
    orderBy: { year: "desc" },
  });

  return NextResponse.json({ years });
}
