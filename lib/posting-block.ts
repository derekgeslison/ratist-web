import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Soft posting-block helpers. Mirrors the user model fields
 * postingBlockedAt / postingBlockedUntil / postingBlockReason, with
 * automatic clearing of expired blocks so the rest of the codebase
 * can treat "blocked or not" as a single boolean.
 *
 * Apply at every user-generated-content creation endpoint that is
 * NOT the user's own review (Comments, Forum threads/replies,
 * Hot Takes, Recasts, Looks Like, Pitches, community collections,
 * Watch Companion suggestions). Ratings themselves are exempt — the
 * block is intentionally not a gag on the user's own review thread.
 */
export async function checkPostingBlock(userId: string): Promise<{ blocked: boolean; until: Date | null; reason: string | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { postingBlockedAt: true, postingBlockedUntil: true, postingBlockReason: true },
  });
  if (!u || !u.postingBlockedAt) return { blocked: false, until: null, reason: null };
  if (u.postingBlockedUntil && u.postingBlockedUntil.getTime() < Date.now()) {
    // Lazy expiry — clear the block on next interaction. Cheaper than
    // running a daily sweep job and keeps the user's first post after
    // expiry from getting an erroneous 403.
    await prisma.user.update({
      where: { id: userId },
      data: { postingBlockedAt: null, postingBlockedUntil: null, postingBlockReason: null },
    }).catch(() => { /* race with concurrent post — block already cleared */ });
    return { blocked: false, until: null, reason: null };
  }
  return { blocked: true, until: u.postingBlockedUntil, reason: u.postingBlockReason };
}

/**
 * Returns a 403 NextResponse if the user is currently posting-blocked,
 * or null if they're allowed through. Caller pattern:
 *
 *   const blockResp = await postingBlockResponse(user.id);
 *   if (blockResp) return blockResp;
 */
export async function postingBlockResponse(userId: string): Promise<NextResponse | null> {
  const { blocked, until, reason } = await checkPostingBlock(userId);
  if (!blocked) return null;
  const untilStr = until ? ` until ${until.toISOString().slice(0, 10)}` : "";
  const message = reason
    ? `You're temporarily blocked from posting${untilStr}. Reason: ${reason}`
    : `You're temporarily blocked from posting${untilStr}.`;
  return NextResponse.json(
    { error: message, postingBlocked: true, until: until?.toISOString() ?? null, reason: reason ?? null },
    { status: 403 },
  );
}
