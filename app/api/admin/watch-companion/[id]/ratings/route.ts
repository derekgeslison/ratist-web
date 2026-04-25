import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Admin-only aggregate + comment dump for a companion's ratings. The
// public /api/watch-companion/:id/rate endpoint deliberately doesn't
// expose counts, so this is the only place to see them. Returns:
//   { upCount, downCount, comments: [{ vote, comment, userName, createdAt }] }
// Comments are sorted newest-first so brand-new feedback bubbles up
// when the moderator opens the page after a regen.

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;

  const [grouped, ratings] = await Promise.all([
    prisma.watchCompanionRating.groupBy({
      by: ["vote"],
      where: { companionId: id },
      _count: { _all: true },
    }),
    prisma.watchCompanionRating.findMany({
      where: { companionId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        vote: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  let upCount = 0;
  let downCount = 0;
  for (const row of grouped) {
    if (row.vote === 1) upCount = row._count._all ?? 0;
    else if (row.vote === -1) downCount = row._count._all ?? 0;
  }

  return NextResponse.json({
    upCount,
    downCount,
    ratings: ratings.map((r) => ({
      id: r.id,
      vote: r.vote,
      comment: r.comment,
      // Anonymize null users (account deleted) as "(removed user)" so the
      // moderator can still see the rating + comment in context.
      userName: r.user?.name ?? "(removed user)",
      userId: r.user?.id ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
