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
    // Group by (season, vote) so the panel can render per-season
    // breakdowns. Movies all sit in seasonNumber=0 — admin code can
    // collapse the single bucket into a "movie" label for display.
    prisma.watchCompanionRating.groupBy({
      by: ["seasonNumber", "vote"],
      where: { companionId: id },
      _count: { _all: true },
    }),
    prisma.watchCompanionRating.findMany({
      where: { companionId: id },
      orderBy: [{ seasonNumber: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        seasonNumber: true,
        vote: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Build per-season counts. Top-level upCount/downCount kept for
  // backwards compat with anything reading the old shape — they're
  // the season-aggregated totals across the whole companion.
  const bySeason = new Map<number, { upCount: number; downCount: number }>();
  let upCount = 0;
  let downCount = 0;
  for (const row of grouped) {
    const bucket = bySeason.get(row.seasonNumber) ?? { upCount: 0, downCount: 0 };
    const count = row._count._all ?? 0;
    if (row.vote === 1) { bucket.upCount = count; upCount += count; }
    else if (row.vote === -1) { bucket.downCount = count; downCount += count; }
    bySeason.set(row.seasonNumber, bucket);
  }
  const seasonBreakdown = Array.from(bySeason.entries())
    .map(([seasonNumber, counts]) => ({ seasonNumber, ...counts }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  return NextResponse.json({
    upCount,
    downCount,
    seasonBreakdown,
    ratings: ratings.map((r) => ({
      id: r.id,
      seasonNumber: r.seasonNumber,
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

// DELETE /api/admin/watch-companion/:id/ratings?ratingId=...
// Hard-deletes a single rating row. Use case: troll spam in the comment
// field — admin can clear individual votes without nuking the whole
// table or downgrading anyone's account. The voter can re-rate
// afterward; this isn't a "ban from rating" action.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const ratingId = req.nextUrl.searchParams.get("ratingId");
  if (!ratingId) return NextResponse.json({ error: "ratingId required" }, { status: 400 });

  // Scope the delete to the route's companion id so a stray ratingId
  // can't reach across companions. deleteMany returns count rather than
  // throwing on miss, which is what we want for an idempotent dismiss.
  const result = await prisma.watchCompanionRating.deleteMany({
    where: { id: ratingId, companionId: id },
  });
  return NextResponse.json({ ok: true, deleted: result.count });
}
