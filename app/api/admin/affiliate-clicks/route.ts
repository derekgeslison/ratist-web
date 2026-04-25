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

// GET /api/admin/affiliate-clicks?days=30
//
// Returns aggregated click counts per provider for the requested time
// window plus the top tmdbIds per provider. Designed for the admin
// analytics report — the totals are the leverage when negotiating
// affiliate partnerships ("we sent you N clicks last quarter").

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = (() => {
    const n = parseInt(daysParam ?? "", 10);
    return Number.isFinite(n) && n > 0 && n <= 365 ? n : 30;
  })();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Per-provider totals over the window. groupBy is one query rather
  // than a per-provider loop.
  const grouped = await prisma.affiliateClick.groupBy({
    by: ["provider"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { provider: "desc" } },
  });

  const providers = grouped.map((g) => ({
    provider: g.provider,
    clicks: g._count._all,
  }));

  // Top tmdbIds per provider — capped at top 10 per. Run sequentially
  // since each provider's "top titles" is its own groupBy. With ~15
  // providers max this is cheap.
  type TopTitle = { tmdbId: number; mediaType: string | null; clicks: number; title: string | null };
  const topByProvider: Record<string, TopTitle[]> = {};
  for (const p of providers) {
    const top = await prisma.affiliateClick.groupBy({
      by: ["tmdbId", "mediaType"],
      where: {
        provider: p.provider,
        createdAt: { gte: since },
        tmdbId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { tmdbId: "desc" } },
      take: 10,
    });

    // Resolve titles for the top tmdbIds — separate Movie / TV lookups.
    const movieIds = top.filter((t) => t.mediaType === "movie").map((t) => t.tmdbId).filter((n): n is number => typeof n === "number");
    const tvIds = top.filter((t) => t.mediaType === "tv").map((t) => t.tmdbId).filter((n): n is number => typeof n === "number");
    const [movies, shows] = await Promise.all([
      movieIds.length > 0
        ? prisma.movie.findMany({ where: { tmdbId: { in: movieIds } }, select: { tmdbId: true, title: true } })
        : Promise.resolve([]),
      tvIds.length > 0
        ? prisma.tVShow.findMany({ where: { tmdbId: { in: tvIds } }, select: { tmdbId: true, name: true } })
        : Promise.resolve([]),
    ]);
    const titleByMovieId = new Map(movies.map((m) => [m.tmdbId, m.title]));
    const titleByShowId = new Map(shows.map((s) => [s.tmdbId, s.name]));

    topByProvider[p.provider] = top.map((t) => ({
      tmdbId: t.tmdbId ?? 0,
      mediaType: t.mediaType,
      clicks: t._count._all,
      title: t.tmdbId
        ? (t.mediaType === "tv" ? titleByShowId.get(t.tmdbId) ?? null : titleByMovieId.get(t.tmdbId) ?? null)
        : null,
    }));
  }

  // Total over the window (all providers). Useful as a one-glance number.
  const totalClicks = providers.reduce((sum, p) => sum + p.clicks, 0);

  return NextResponse.json({
    days,
    since: since.toISOString(),
    totalClicks,
    providers,
    topByProvider,
  });
}
