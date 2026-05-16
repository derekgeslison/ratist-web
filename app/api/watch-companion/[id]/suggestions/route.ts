import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { postingBlockResponse } from "@/lib/posting-block";
import { getMutualBlockedIds } from "@/lib/blocks";

export const dynamic = "force-dynamic";

const ACTIONS = ["add", "edit", "remove"] as const;
const TARGET_TYPES = [
  "character", "fact", "relationship", "timeline", "glossary", "baseDescription",
  // Recap alternatives — never auto-applied. They show up under the
  // canonical recap as community alts sorted by upvote score. The
  // payload carries { text, seasonNumber? } and the action is always
  // "add". The vote + apply paths recognize these and skip the
  // threshold-driven publish step.
  "recap_installment",
  "recap_series",
] as const;
const RECAP_TARGET_TYPES = ["recap_installment", "recap_series"] as const;

// Submit a new suggestion
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to suggest an edit" }, { status: 401 });

  // Site-wide posting block (separate from the companion-specific
  // block below — admins can apply either, this catches the broad one).
  const blockResp = await postingBlockResponse(user.id);
  if (blockResp) return blockResp;

  // Admin-set troll block. We fetch the flag here rather than in getAuthedUser
  // since it's companion-specific and most routes don't care. The optional
  // blockedUntil timestamp auto-lifts the block when the date passes.
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { companionSuggestionsBlocked: true, companionSuggestionsBlockedUntil: true },
  });
  if (userRecord?.companionSuggestionsBlocked) {
    const expiry = userRecord.companionSuggestionsBlockedUntil;
    if (!expiry || expiry > new Date()) {
      return NextResponse.json({ error: "Your suggestion submissions have been paused by moderators." }, { status: 403 });
    }
    // Expired — auto-clear the flag so future requests go fast-path.
    await prisma.user.update({
      where: { id: user.id },
      data: { companionSuggestionsBlocked: false, companionSuggestionsBlockedUntil: null },
    });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as {
    action?: unknown; targetType?: unknown; targetId?: unknown;
    rationale?: unknown; payload?: unknown;
  } | null;

  const action = typeof body?.action === "string" && (ACTIONS as readonly string[]).includes(body.action) ? body.action : null;
  const targetType = typeof body?.targetType === "string" && (TARGET_TYPES as readonly string[]).includes(body.targetType) ? body.targetType : null;
  const targetId = typeof body?.targetId === "string" && body.targetId.length > 0 ? body.targetId : null;
  const rationale = typeof body?.rationale === "string" ? body.rationale.slice(0, 1000) : null;
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  if (!action) return NextResponse.json({ error: "action must be add/edit/remove" }, { status: 400 });
  if (!targetType) return NextResponse.json({ error: "targetType invalid" }, { status: 400 });

  // Recap alternatives are always "add" — there's no item to edit or
  // remove because they're freestanding alternative paragraphs, not
  // edits to an existing row. Validate that here so a confused client
  // can't sneak in an "edit" with a recap targetType.
  const isRecapAlt = (RECAP_TARGET_TYPES as readonly string[]).includes(targetType);
  if (isRecapAlt) {
    if (action !== "add") return NextResponse.json({ error: "Recap alternatives must use action=add" }, { status: 400 });
    const text = (payload as { text?: unknown }).text;
    if (typeof text !== "string" || text.trim().length < 30) {
      return NextResponse.json({ error: "Recap alternative must include text (≥30 chars) in payload" }, { status: 400 });
    }
  } else if (action !== "add" && !targetId) {
    return NextResponse.json({ error: "targetId required for edit/remove" }, { status: 400 });
  }

  // Verify companion exists
  const companion = await prisma.watchCompanion.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!companion) return NextResponse.json({ error: "Companion not found" }, { status: 404 });
  if (companion.status !== "published") return NextResponse.json({ error: "This companion isn't published yet" }, { status: 400 });

  // Simple rate limit — 10 suggestions per hour per user per companion
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.companionSuggestion.count({
    where: { companionId: id, submitterId: user.id, createdAt: { gte: hourAgo } },
  });
  if (recent >= 10) return NextResponse.json({ error: "Too many suggestions — try again in an hour." }, { status: 429 });

  const suggestion = await prisma.companionSuggestion.create({
    data: {
      companionId: id,
      submitterId: user.id,
      action,
      targetType,
      targetId,
      rationale,
      payload: payload as object,
      status: "pending",
    },
  });

  return NextResponse.json({ suggestion });
}

// List suggestions (pending for community voting; approved for historical reference)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const validStatus = status === "approved" || status === "dismissed" || status === "pending" ? status : "pending";

  // Pull viewer + their mutual-blocks set up-front so we can both
  // filter suggestions and load the user's vote state in one auth pass.
  const user = await getAuthedUser(req);
  const blockedIds = await getMutualBlockedIds(user?.id);

  const suggestions = await prisma.companionSuggestion.findMany({
    where: {
      companionId: id,
      status: validStatus,
      ...(blockedIds.size > 0 ? { submitterId: { notIn: [...blockedIds] } } : {}),
    },
    orderBy: [{ upvoteScore: "desc" }, { createdAt: "desc" }],
    include: {
      submitter: { select: { id: true, name: true, avatarUrl: true } },
    },
    take: 50,
  });

  // If signed in, also return this user's votes so UI can show current state
  let myVotes: Record<string, number> = {};
  if (user && suggestions.length > 0) {
    const votes = await prisma.companionSuggestionVote.findMany({
      where: { voterId: user.id, suggestionId: { in: suggestions.map((s) => s.id) } },
      select: { suggestionId: true, vote: true },
    });
    myVotes = Object.fromEntries(votes.map((v) => [v.suggestionId, v.vote]));
  }

  return NextResponse.json({ suggestions, myVotes });
}
