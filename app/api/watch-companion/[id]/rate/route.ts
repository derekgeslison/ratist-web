import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// Per-companion thumbs up/down with an optional comment. One vote per
// user per companion; subsequent calls upsert. Counts are admin-only —
// this endpoint never returns an aggregate so a public page can't reveal
// how many up/down votes a companion has accrued.

// Season scoping: 0 = movie or "whole show" placeholder, 1+ = a TV
// season. The widget passes the user's currently-viewed season for TV
// companions and 0 for movies. Validate as a non-negative integer so a
// malformed query string can't sneak through to Prisma.
function parseSeason(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

// GET /api/watch-companion/:id/rate?season=N — returns the current
// user's vote for that season (or null), so the UI can highlight their
// existing thumb when the page loads. Movies pass season=0.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ rating: null });

  const { id } = await ctx.params;
  const seasonNumber = parseSeason(req.nextUrl.searchParams.get("season"));
  const rating = await prisma.watchCompanionRating.findUnique({
    where: { companionId_userId_seasonNumber: { companionId: id, userId: user.id, seasonNumber } },
    select: { vote: true, comment: true, seasonNumber: true, updatedAt: true },
  });
  return NextResponse.json({ rating });
}

// POST /api/watch-companion/:id/rate
//   body { vote: 1 | -1, comment?: string, seasonNumber?: number }
//   Upserts the user's rating for the specified season (defaults to 0
//   for movies). Comment is optional; passing an empty string clears
//   any previous comment, undefined leaves it unchanged.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to rate this companion" }, { status: 401 });

  const { id } = await ctx.params;

  // Fail fast on a missing companion rather than letting Prisma's FK error
  // surface as a generic 500 — keeps the client's error message useful.
  const companion = await prisma.watchCompanion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!companion) return NextResponse.json({ error: "Companion not found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { vote?: unknown; comment?: unknown; seasonNumber?: unknown } | null;
  const voteRaw = body?.vote;
  const vote = voteRaw === 1 || voteRaw === -1 ? voteRaw : null;
  if (vote === null) return NextResponse.json({ error: "vote must be 1 or -1" }, { status: 400 });
  const seasonNumber = parseSeason(body?.seasonNumber);

  // Comment handling:
  //   string → save (trim + cap at 1000 chars)
  //   "" → clear (admin shouldn't see an empty stub for a vote that lost
  //         its comment)
  //   undefined → leave the existing comment alone (handled by omitting
  //         the key from the upsert payload)
  let commentValue: string | null | undefined;
  if (typeof body?.comment === "string") {
    const trimmed = body.comment.trim().slice(0, 1000);
    commentValue = trimmed.length > 0 ? trimmed : null;
  } else {
    commentValue = undefined;
  }

  const rating = await prisma.watchCompanionRating.upsert({
    where: { companionId_userId_seasonNumber: { companionId: id, userId: user.id, seasonNumber } },
    create: {
      companionId: id,
      userId: user.id,
      seasonNumber,
      vote,
      comment: commentValue ?? null,
    },
    update: {
      vote,
      ...(commentValue !== undefined ? { comment: commentValue } : {}),
    },
    select: { vote: true, comment: true, seasonNumber: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, rating });
}
