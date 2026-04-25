import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// "Notify me when this is streaming" subscription toggle.
//
// GET ?tmdbId=X&mediaType=Y → { watching: boolean }
//   true means an unresolved row exists (notifiedAt is null). A row that
//   has already fired its notification reads as not-watching so the UI
//   re-offers the subscribe button if the user wants to be alerted again
//   on a future re-add.
// POST   { tmdbId, mediaType } → creates row (or resets a notified one).
// DELETE { tmdbId, mediaType } → removes row entirely.

function parseBody(body: unknown): { tmdbId: number; mediaType: "movie" | "tv" } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const tmdbId = typeof b.tmdbId === "number" && b.tmdbId > 0 ? Math.floor(b.tmdbId) : null;
  const mediaType = b.mediaType === "movie" || b.mediaType === "tv" ? b.mediaType : null;
  if (!tmdbId || !mediaType) return null;
  return { tmdbId, mediaType };
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ watching: false });

  const tmdbId = parseInt(req.nextUrl.searchParams.get("tmdbId") ?? "", 10);
  const mediaType = req.nextUrl.searchParams.get("mediaType");
  if (!Number.isFinite(tmdbId) || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json({ watching: false });
  }

  const row = await prisma.streamingWatch.findUnique({
    where: { userId_tmdbId_mediaType: { userId: user.id, tmdbId, mediaType } },
    select: { id: true, notifiedAt: true },
  });
  return NextResponse.json({ watching: !!row && !row.notifiedAt });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to subscribe to streaming alerts." }, { status: 401 });

  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "tmdbId and mediaType required" }, { status: 400 });

  // Upsert resets notifiedAt so a user who got alerted, then later
  // wants alerts again (e.g., after a title leaves and re-enters
  // streaming) gets re-armed by the same toggle.
  await prisma.streamingWatch.upsert({
    where: { userId_tmdbId_mediaType: { userId: user.id, tmdbId: body.tmdbId, mediaType: body.mediaType } },
    create: { userId: user.id, tmdbId: body.tmdbId, mediaType: body.mediaType },
    update: { notifiedAt: null, notifiedProviders: null },
  });
  return NextResponse.json({ watching: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "tmdbId and mediaType required" }, { status: 400 });

  await prisma.streamingWatch.deleteMany({
    where: { userId: user.id, tmdbId: body.tmdbId, mediaType: body.mediaType },
  });
  return NextResponse.json({ watching: false });
}
