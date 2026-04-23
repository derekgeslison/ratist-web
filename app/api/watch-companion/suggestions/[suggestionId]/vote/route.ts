import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import {
  isCriticUser, recomputeSuggestionScore, shouldAutoApprove, shouldAutoDismiss,
  CRITIC_VOTE_WEIGHT, REGULAR_VOTE_WEIGHT,
} from "@/lib/watch-companion-trust";
import { applySuggestion } from "@/lib/watch-companion-apply";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ suggestionId: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });

  const { suggestionId } = await ctx.params;
  const body = await req.json().catch(() => null) as { vote?: unknown } | null;
  const voteValue = body?.vote === 1 || body?.vote === -1 || body?.vote === 0 ? body.vote : null;
  if (voteValue === null) return NextResponse.json({ error: "vote must be 1, -1, or 0 (to remove)" }, { status: 400 });

  const suggestion = await prisma.companionSuggestion.findUnique({
    where: { id: suggestionId },
    select: { id: true, companionId: true, status: true, submitterId: true },
  });
  if (!suggestion) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  if (suggestion.status !== "pending") return NextResponse.json({ error: "This suggestion has already been resolved" }, { status: 400 });
  if (suggestion.submitterId === user.id) return NextResponse.json({ error: "You can't vote on your own suggestion" }, { status: 400 });

  const isCritic = await isCriticUser(user.id);
  const weight = isCritic ? CRITIC_VOTE_WEIGHT : REGULAR_VOTE_WEIGHT;

  if (voteValue === 0) {
    // Remove existing vote
    await prisma.companionSuggestionVote.deleteMany({
      where: { suggestionId, voterId: user.id },
    });
  } else {
    // Upsert
    await prisma.companionSuggestionVote.upsert({
      where: { suggestionId_voterId: { suggestionId, voterId: user.id } },
      create: { suggestionId, voterId: user.id, vote: voteValue, weight },
      update: { vote: voteValue, weight },
    });
  }

  // Recompute + persist cached score
  const score = await recomputeSuggestionScore(suggestionId);
  await prisma.companionSuggestion.update({
    where: { id: suggestionId },
    data: { upvoteScore: score.upvoteScore, voteCount: score.voteCount },
  });

  // Auto-resolve?
  let autoResolved: "approved" | "dismissed" | null = null;
  if (shouldAutoApprove(score)) {
    await prisma.companionSuggestion.update({
      where: { id: suggestionId },
      data: { status: "approved", resolvedAt: new Date(), resolutionNote: "Auto-approved by community vote" },
    });
    await applySuggestion(suggestionId).catch((err) => {
      console.error("Failed to apply auto-approved suggestion:", err);
    });
    autoResolved = "approved";
  } else if (shouldAutoDismiss(score)) {
    await prisma.companionSuggestion.update({
      where: { id: suggestionId },
      data: { status: "dismissed", resolvedAt: new Date(), resolutionNote: "Auto-dismissed by community vote" },
    });
    autoResolved = "dismissed";
  }

  return NextResponse.json({ score, autoResolved });
}
