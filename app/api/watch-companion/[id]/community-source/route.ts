import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/watch-companion/:id/community-source?targetType=character&itemId=xyz
//
// Returns the approved CompanionSuggestion(s) that produced or modified
// the given item, so the public viewer can show "what was changed" when
// a user taps the green community-sourced badge. Surfaces the submitter,
// the payload, rationale, and the resolution timestamp — enough for a
// viewer to judge the change and report it if the content is bad.
//
// Open to anyone (no auth check) — the data is the same as what the
// public companion page already shows. Authentication only matters for
// the subsequent /api/reports POST when the user actually reports.

const ALLOWED_TARGET_TYPES = new Set([
  "character",
  "fact",
  "relationship",
  "timeline",
  "glossary",
  "baseDescription",
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get("targetType") ?? "";
  const itemId = searchParams.get("itemId") ?? "";

  if (!ALLOWED_TARGET_TYPES.has(targetType)) {
    return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
  }
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  // For "edit" suggestions the suggestion's targetId points at the
  // existing item; for "add" suggestions it's the appliedItemId that
  // captures the row created on apply. Either match means this item
  // is community-sourced — we union them and return whatever's in there.
  const suggestions = await prisma.companionSuggestion.findMany({
    where: {
      companionId: id,
      status: "approved",
      targetType,
      OR: [
        { targetId: itemId },
        { appliedItemId: itemId },
      ],
    },
    orderBy: { resolvedAt: "desc" },
    include: {
      submitter: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      action: s.action,
      targetType: s.targetType,
      targetId: s.targetId,
      payload: s.payload,
      rationale: s.rationale,
      resolvedAt: s.resolvedAt?.toISOString() ?? null,
      submitter: s.submitter,
    })),
  });
}
