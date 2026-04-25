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

/**
 * Reverses an applied community suggestion using the snapshot captured at
 * apply-time. Three paths:
 *   - edit → write originalSnapshot back into the item
 *   - add  → delete the row created via appliedItemId
 *   - remove → recreate the row from originalSnapshot (cascade children
 *             are lost — best-effort restoration)
 * Marks the suggestion as "reverted" so the Revert button hides after use
 * and the item's community-sourced badge falls away.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ suggestionId: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { suggestionId } = await ctx.params;
  const suggestion = await prisma.companionSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (suggestion.status === "reverted") return NextResponse.json({ error: "Already reverted" }, { status: 400 });

  try {
    if (suggestion.action === "edit" && suggestion.targetId && suggestion.originalSnapshot) {
      await restoreSnapshot(suggestion.targetType, suggestion.targetId, suggestion.originalSnapshot as Record<string, unknown>);
    } else if (suggestion.action === "add" && suggestion.appliedItemId) {
      await deleteApplied(suggestion.targetType, suggestion.appliedItemId);
    } else if (suggestion.action === "remove" && suggestion.originalSnapshot) {
      await recreateFromSnapshot(suggestion.targetType, suggestion.companionId, suggestion.originalSnapshot as Record<string, unknown>);
    } else {
      return NextResponse.json({ error: "Nothing to revert (missing snapshot or applied id)" }, { status: 400 });
    }

    await prisma.companionSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "reverted",
        resolvedById: user.id,
        resolvedAt: new Date(),
        resolutionNote: "Reverted by admin",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Revert error:", err);
    return NextResponse.json({ error: "Revert failed" }, { status: 500 });
  }
}

async function restoreSnapshot(targetType: string, targetId: string, snapshot: Record<string, unknown>) {
  // Strip id / companionId — they're identifiers, not updatable fields.
  const data = pickWritableFields(targetType, snapshot);
  if (Object.keys(data).length === 0) return;
  switch (targetType) {
    case "character":
    case "baseDescription":
      await prisma.companionCharacter.update({ where: { id: targetId }, data });
      return;
    case "fact":
      await prisma.companionFact.update({ where: { id: targetId }, data });
      return;
    case "relationship":
      await prisma.companionRelationship.update({ where: { id: targetId }, data });
      return;
    case "timeline":
      await prisma.companionTimelineEvent.update({ where: { id: targetId }, data });
      return;
    case "glossary":
      await prisma.companionGlossaryTerm.update({ where: { id: targetId }, data });
      return;
  }
}

async function deleteApplied(targetType: string, appliedItemId: string) {
  switch (targetType) {
    case "character": await prisma.companionCharacter.deleteMany({ where: { id: appliedItemId } }); return;
    case "fact":      await prisma.companionFact.deleteMany({ where: { id: appliedItemId } }); return;
    case "relationship": await prisma.companionRelationship.deleteMany({ where: { id: appliedItemId } }); return;
    case "timeline":  await prisma.companionTimelineEvent.deleteMany({ where: { id: appliedItemId } }); return;
    case "glossary":  await prisma.companionGlossaryTerm.deleteMany({ where: { id: appliedItemId } }); return;
  }
}

async function recreateFromSnapshot(targetType: string, companionId: string, snapshot: Record<string, unknown>) {
  // Snapshot carries all original fields including id. Passing id back on
  // create restores the row with its original primary key (any surviving
  // foreign key references stay intact — rare since cascade already
  // removed them on delete, but harmless).
  switch (targetType) {
    case "character":
      await prisma.companionCharacter.create({ data: snapshot as never });
      return;
    case "fact":
      await prisma.companionFact.create({ data: snapshot as never });
      return;
    case "relationship":
      await prisma.companionRelationship.create({ data: { ...snapshot, companionId } as never });
      return;
    case "timeline":
      await prisma.companionTimelineEvent.create({ data: { ...snapshot, companionId } as never });
      return;
    case "glossary":
      await prisma.companionGlossaryTerm.create({ data: { ...snapshot, companionId } as never });
      return;
  }
}

function pickWritableFields(targetType: string, snapshot: Record<string, unknown>): Record<string, unknown> {
  // Fields each table considers writable — mirrors the edit path in
  // watch-companion-apply.ts.
  const FIELDS: Record<string, string[]> = {
    character: ["name", "actorName", "actorTmdbId", "baseDescription", "visibleAfter", "group", "imageUrl", "sortOrder", "seasonNumber", "nameAliases", "groupHistory"],
    baseDescription: ["baseDescription"],
    fact: ["fact", "factType", "visibleAfter"],
    relationship: ["fromCharacterId", "toCharacterId", "relationshipType", "label", "directed", "visibleAfter", "seasonNumber"],
    timeline: ["description", "importance", "characterIds", "visibleAfter", "seasonNumber"],
    glossary: ["term", "definition", "category", "sortOrder", "visibleAfter", "seasonNumber"],
  };
  const keys = FIELDS[targetType] ?? [];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in snapshot) out[k] = snapshot[k];
  return out;
}
