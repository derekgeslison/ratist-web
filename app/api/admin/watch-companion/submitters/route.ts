import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

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
  suggestionsBlockedUntil: string | null;
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

  // Optional scope: when set, the stats only cover suggestions submitted
  // on this companion — drives the per-companion Submitters tab on the
  // admin detail page.
  const { searchParams } = new URL(req.url);
  const companionId = searchParams.get("companionId");

  const grouped = await prisma.companionSuggestion.groupBy({
    by: ["submitterId", "status"],
    where: companionId ? { companionId } : undefined,
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

  // Always surface currently-blocked submitters, even when their suggestion
  // rows have been deleted (or, in companion-scope, when they never
  // submitted on this companion). Otherwise admins lose the affordance to
  // unblock or check the expiry once the queue is cleaned out — the user
  // just disappears from the table. Empty stats are filled with zeros so
  // the row still renders; sort still puts them sensibly.
  const blockedUsers = await prisma.user.findMany({
    where: { companionSuggestionsBlocked: true },
    select: { id: true },
  });
  for (const u of blockedUsers) {
    if (!byUser.has(u.id)) {
      byUser.set(u.id, { pending: 0, approved: 0, dismissed: 0, lastAt: null });
    }
  }

  const ids = Array.from(byUser.keys());
  const users = ids.length === 0
    ? []
    : await prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, name: true, email: true, avatarUrl: true,
          companionSuggestionsBlocked: true, companionSuggestionsBlockedUntil: true,
        },
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
      suggestionsBlockedUntil: u.companionSuggestionsBlockedUntil?.toISOString() ?? null,
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

// Toggle a user's suggestion-block flag. When blocking, the admin can
// optionally set an expiry timestamp and attach a message that gets
// delivered as an in-app notification to the blocked user.
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    userId?: unknown; blocked?: unknown;
    blockedUntil?: unknown; message?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" && body.userId.length > 0 ? body.userId : null;
  const blocked = typeof body?.blocked === "boolean" ? body.blocked : null;
  if (!userId || blocked === null) return NextResponse.json({ error: "userId + blocked (boolean) required" }, { status: 400 });

  let blockedUntil: Date | null = null;
  if (blocked && typeof body?.blockedUntil === "string" && body.blockedUntil.length > 0) {
    const parsed = new Date(body.blockedUntil);
    if (isNaN(parsed.getTime())) return NextResponse.json({ error: "blockedUntil must be a valid ISO date" }, { status: 400 });
    if (parsed <= new Date()) return NextResponse.json({ error: "blockedUntil must be in the future" }, { status: 400 });
    blockedUntil = parsed;
  }
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";

  await prisma.user.update({
    where: { id: userId },
    data: {
      companionSuggestionsBlocked: blocked,
      // Always clear the expiry when unblocking so a stale timestamp doesn't
      // leak into a future block.
      companionSuggestionsBlockedUntil: blocked ? blockedUntil : null,
    },
  });

  if (blocked) {
    // Notify the blocked user so they know their submissions are paused and
    // can see the admin's reasoning. Uses the shared notify() helper which
    // handles pref-opt-outs and dedup cooldowns.
    const untilLine = blockedUntil ? ` until ${blockedUntil.toLocaleDateString()}` : "";
    const prefix = `Your Watch Companion submissions have been paused${untilLine}.`;
    const body = message ? `${prefix} Moderator note: ${message}` : prefix;
    await notify({
      recipientId: userId,
      actorId: user.id,
      type: "companion_block",
      targetType: "user",
      // Unique targetId per block event keeps the cooldown dedup from
      // swallowing the notification when an admin blocks → unblocks → blocks
      // the same user in quick succession.
      targetId: `${userId}:${Date.now()}`,
      message: body,
      // No link — the notification renders as an admin-style message with
      // an Acknowledge button, not a clickable row. Pointing it at
      // /watch-companion just dropped users on a generic landing page.
    });
  }

  return NextResponse.json({ ok: true });
}
