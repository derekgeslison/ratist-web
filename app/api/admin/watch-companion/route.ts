import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

// List all companions (for admin panel)
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const companions = await prisma.watchCompanion.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        tmdbId: true,
        mediaType: true,
        title: true,
        status: true,
        seasonsGenerated: true,
        lastGeneratedAt: true,
        publishedAt: true,
        updatedAt: true,
        airingSeasons: {
          select: { seasonNumber: true, episodesGenerated: true, status: true, failureCount: true },
          orderBy: { seasonNumber: "asc" },
        },
        _count: {
          select: {
            characters: true,
            relationships: true,
            timeline: true,
            glossary: true,
            suggestions: { where: { status: "pending" } },
          },
        },
      },
    });

    // Per-companion rating counts. One groupBy across all companions is
    // O(votes) and avoids the N+1 we'd get fetching them per row in the
    // .map below. Buckets become a quick lookup so the response merge
    // stays linear in companion count.
    const ratingGroups = await prisma.watchCompanionRating.groupBy({
      by: ["companionId", "vote"],
      _count: { _all: true },
    });
    const ratingsByCompanion = new Map<string, { upCount: number; downCount: number }>();
    for (const row of ratingGroups) {
      const cur = ratingsByCompanion.get(row.companionId) ?? { upCount: 0, downCount: 0 };
      const count = row._count._all ?? 0;
      if (row.vote === 1) cur.upCount = count;
      else if (row.vote === -1) cur.downCount = count;
      ratingsByCompanion.set(row.companionId, cur);
    }
    const enriched = companions.map((c) => {
      const r = ratingsByCompanion.get(c.id) ?? { upCount: 0, downCount: 0 };
      return { ...c, ratings: r };
    });

    return NextResponse.json({ companions: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Watch Companion list error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
