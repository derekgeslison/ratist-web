import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const ACTIONS = ["add", "edit", "remove"] as const;
const TARGET_TYPES = ["character", "fact", "relationship", "timeline", "glossary", "baseDescription"] as const;

// Submit a new suggestion
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to suggest an edit" }, { status: 401 });

  // Admin-set troll block. We fetch the flag here rather than in getAuthedUser
  // since it's companion-specific and most routes don't care.
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { companionSuggestionsBlocked: true },
  });
  if (userRecord?.companionSuggestionsBlocked) {
    return NextResponse.json({ error: "Your suggestion submissions have been paused by moderators." }, { status: 403 });
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
  if (action !== "add" && !targetId) return NextResponse.json({ error: "targetId required for edit/remove" }, { status: 400 });

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

  const suggestions = await prisma.companionSuggestion.findMany({
    where: { companionId: id, status: validStatus },
    orderBy: [{ upvoteScore: "desc" }, { createdAt: "desc" }],
    include: {
      submitter: { select: { id: true, name: true, avatarUrl: true } },
    },
    take: 50,
  });

  // If signed in, also return this user's votes so UI can show current state
  const user = await getAuthedUser(req);
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
