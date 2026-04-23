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

interface SubmitterRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  suggestionsBlocked: boolean;
  pending: number;
  approved: number;
  dismissed: number;
  total: number;
  dismissalRate: number; // dismissed / resolved (approved + dismissed)
  lastSubmittedAt: string | null;
}

/**
 * Aggregates per-user Watch Companion suggestion stats for moderation. Sorts
 * by dismissal rate desc so submitters whose suggestions are mostly being
 * rejected float to the top — those are the ones worth reviewing for a block.
 * Only includes users who've submitted at least one suggestion.
 */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grouped = await prisma.companionSuggestion.groupBy({
    by: ["submitterId", "status"],
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const byUser = new Map<string, { pending: number; approved: number; dismissed: number; lastAt: Date | null }>();
  for (const row of grouped) {
    const cur = byUser.get(row.submitterId) ?? { pending: 0, approved: 0, dismissed: 0, lastAt: null as Date | null };
    const count = row._count._all ?? 0;
    if (row.status === "pending") cur.pending = count;
    else if (row.status === "approved") cur.approved = count;
    else if (row.status === "dismissed") cur.dismissed = count;
    if (row._max.createdAt && (!cur.lastAt || row._max.createdAt > cur.lastAt)) {
      cur.lastAt = row._max.createdAt;
    }
    byUser.set(row.submitterId, cur);
  }

  const ids = Array.from(byUser.keys());
  const users = ids.length === 0
    ? []
    : await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, avatarUrl: true, companionSuggestionsBlocked: true },
      });

  const rows: SubmitterRow[] = users.map((u) => {
    const s = byUser.get(u.id)!;
    const resolved = s.approved + s.dismissed;
    const total = s.pending + resolved;
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      suggestionsBlocked: u.companionSuggestionsBlocked,
      pending: s.pending,
      approved: s.approved,
      dismissed: s.dismissed,
      total,
      dismissalRate: resolved > 0 ? s.dismissed / resolved : 0,
      lastSubmittedAt: s.lastAt?.toISOString() ?? null,
    };
  });

  // Sort by dismissal rate desc, then total desc — puts the "frequent troll"
  // archetype at the top. Admins with high approval rates sink to the bottom.
  rows.sort((a, b) => (b.dismissalRate - a.dismissalRate) || (b.total - a.total));

  return NextResponse.json({ submitters: rows });
}

// Toggle a user's suggestion-block flag
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { userId?: unknown; blocked?: unknown } | null;
  const userId = typeof body?.userId === "string" && body.userId.length > 0 ? body.userId : null;
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (!userId || blocked === null) return NextResponse.json({ error: "userId + blocked (boolean) required" }, { status: 400 });

  await prisma.user.update({
    where: { id: userId },
    data: { companionSuggestionsBlocked: blocked },
  });
  return NextResponse.json({ ok: true });
}
