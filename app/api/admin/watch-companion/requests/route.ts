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

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const valid = status === "approved" || status === "denied" || status === "pending" || status === "fulfilled" ? status : "pending";

  // Fetch requests + their submitter info in one go.
  const requests = await prisma.companionGenerationRequest.findMany({
    where: { status: valid },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (requests.length === 0) return NextResponse.json({ requests: [] });

  const userIds = Array.from(new Set(requests.map((r) => r.requesterId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Coalesce titles by looking up Movie/TVShow rows that exist locally.
  const movieIds = Array.from(new Set(requests.filter((r) => r.mediaType === "movie").map((r) => r.tmdbId)));
  const tvIds = Array.from(new Set(requests.filter((r) => r.mediaType === "tv").map((r) => r.tmdbId)));
  const [movies, shows] = await Promise.all([
    movieIds.length > 0
      ? prisma.movie.findMany({ where: { tmdbId: { in: movieIds } }, select: { tmdbId: true, title: true } })
      : Promise.resolve([]),
    tvIds.length > 0
      ? prisma.tVShow.findMany({ where: { tmdbId: { in: tvIds } }, select: { tmdbId: true, name: true } })
      : Promise.resolve([]),
  ]);
  const titleMap = new Map<string, string>();
  for (const m of movies) titleMap.set(`movie:${m.tmdbId}`, m.title);
  for (const s of shows) titleMap.set(`tv:${s.tmdbId}`, s.name);

  const enriched = requests.map((r) => ({
    ...r,
    requester: userMap.get(r.requesterId) ?? { id: r.requesterId, name: "(unknown)", email: "", avatarUrl: null },
    title: titleMap.get(`${r.mediaType}:${r.tmdbId}`) ?? null,
  }));

  return NextResponse.json({ requests: enriched });
}

/**
 * Approve or deny a request. Approval DOES NOT trigger generation — the admin
 * still clicks into the generate flow to kick it off. Notification firing
 * happens at publish time (see app/api/admin/watch-companion/[id]/route.ts
 * PATCH handler) so we don't notify users about a companion that isn't ready.
 */
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { id?: unknown; status?: unknown; denyReason?: unknown } | null;
  const id = typeof body?.id === "string" && body.id.length > 0 ? body.id : null;
  const nextStatus = body?.status === "approved" || body?.status === "denied" ? body.status : null;
  const denyReason = typeof body?.denyReason === "string" ? body.denyReason.slice(0, 500) : null;
  if (!id || !nextStatus) return NextResponse.json({ error: "id + status ('approved'|'denied') required" }, { status: 400 });

  await prisma.companionGenerationRequest.update({
    where: { id },
    data: {
      status: nextStatus,
      resolvedById: user.id,
      resolvedAt: new Date(),
      denyReason: nextStatus === "denied" ? denyReason : null,
    },
  });
  return NextResponse.json({ ok: true });
}
