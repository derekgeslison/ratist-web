/**
 * Per-user spotlight dismissal records. Drives cross-device dismissal
 * for the announcement banner: dismiss on desktop, never see it again
 * even after signing in elsewhere.
 *
 * GET — returns the set of spotlight ids the current user has
 *       dismissed. Empty array for unauthed users (the banner falls
 *       back to localStorage in that case).
 * POST — records a dismissal. Idempotent via composite-PK upsert.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ ids: [] });

  const rows = await prisma.spotlightDismissal.findMany({
    where: { userId: user.id },
    select: { spotlightId: true },
  });
  return NextResponse.json({ ids: rows.map((r) => r.spotlightId) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to dismiss across devices" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const spotlightId = typeof body?.spotlightId === "string" ? body.spotlightId : null;
  if (!spotlightId) return NextResponse.json({ error: "spotlightId required" }, { status: 400 });

  // upsert keeps a re-dismiss as a no-op rather than 409'ing — the
  // banner can fire POST liberally without tracking what's already
  // recorded.
  await prisma.spotlightDismissal.upsert({
    where: { userId_spotlightId: { userId: user.id, spotlightId } },
    create: { userId: user.id, spotlightId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
