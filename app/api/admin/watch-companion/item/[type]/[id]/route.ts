import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Generic edit/delete endpoint for companion content. Dispatches on the item
// type. Validates payload fields per type and ignores anything unrecognized.
//
// PATCH /api/admin/watch-companion/item/:type/:id
//   body: partial fields to update (per type — see switch below)
// DELETE /api/admin/watch-companion/item/:type/:id

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

const VALID_TYPES = ["character", "fact", "relationship", "timeline", "glossary"] as const;
type ItemType = (typeof VALID_TYPES)[number];

function isValidType(t: string): t is ItemType {
  return (VALID_TYPES as readonly string[]).includes(t);
}

// Mirrors the shape stored in DB for visibleAfter
type VisibleAfter = Record<string, number>;

function normVisibleAfter(raw: unknown): VisibleAfter | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: VisibleAfter = {};
  if (typeof o.seconds === "number" && o.seconds >= 0) out.seconds = Math.floor(o.seconds);
  if (typeof o.season === "number" && o.season > 0) out.season = Math.floor(o.season);
  if (typeof o.episode === "number" && o.episode > 0) out.episode = Math.floor(o.episode);
  return out;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = await ctx.params;
  if (!isValidType(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

  const str = (k: string, max: number) => typeof body[k] === "string" ? (body[k] as string).slice(0, max) : undefined;
  const visibleAfter = normVisibleAfter(body.visibleAfter);

  try {
    switch (type) {
      case "character": {
        const data: Record<string, unknown> = {};
        const name = str("name", 120); if (name !== undefined) data.name = name;
        const baseDescription = str("baseDescription", 600); if (baseDescription !== undefined) data.baseDescription = baseDescription;
        if ("group" in body) data.group = typeof body.group === "string" ? (body.group as string).slice(0, 80) : null;
        if ("actorName" in body) data.actorName = typeof body.actorName === "string" ? (body.actorName as string).slice(0, 120) : null;
        // Move actorTmdbId in lockstep with actorName so the celebrity link
        // doesn't drift to a stale id when the character's actor changes.
        if ("actorTmdbId" in body) data.actorTmdbId = typeof body.actorTmdbId === "number" ? body.actorTmdbId : null;
        // Admin-controlled cast order. The viewer renders characters by
        // sortOrder asc, so moderators use this to move community-added
        // cards out of the middle of the list or to reshuffle a bad
        // generator order.
        if (typeof body.sortOrder === "number") data.sortOrder = Math.max(0, Math.floor(body.sortOrder));
        if (visibleAfter) data.visibleAfter = visibleAfter;
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        const updated = await prisma.companionCharacter.update({ where: { id }, data });

        // Keep the companionCharacterActor side-table in sync with the
        // primary actor change. The front-end viewer reads the
        // displayed actor from actors[] FIRST and only falls back to
        // the character row's primary fields when the side-table is
        // empty (see WatchCompanionView.tsx). Without this sync, an
        // admin fixes the actor here, sees the change in the editor,
        // but viewers still see the old actor on the public page —
        // exactly the "Sean Bean in admin / Musgrave on the page"
        // failure mode.
        //
        // persistDraft always writes the primary as the lowest-
        // sortOrder side-table row (sortOrder 0), so updating the
        // lowest row preserves multi-actor characters' other entries
        // (the "adult Murph" / "elderly Murph" rows stay intact).
        if ("actorName" in body || "actorTmdbId" in body) {
          const earliestRow = await prisma.companionCharacterActor.findFirst({
            where: { characterId: id },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          });
          if (earliestRow && updated.actorName) {
            await prisma.companionCharacterActor.update({
              where: { id: earliestRow.id },
              data: {
                actorName: updated.actorName,
                actorTmdbId: updated.actorTmdbId,
              },
            });
          }
          // No earliestRow → legacy character with no side-table
          // rows. The viewer's fallback path renders from primary
          // fields directly, so we don't need to create one.
        }
        return NextResponse.json({ item: updated });
      }
      case "fact": {
        const data: Record<string, unknown> = {};
        const fact = str("fact", 400); if (fact !== undefined) data.fact = fact;
        const factType = str("factType", 40); if (factType !== undefined) data.factType = factType;
        if (visibleAfter) data.visibleAfter = visibleAfter;
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        const updated = await prisma.companionFact.update({ where: { id }, data });
        return NextResponse.json({ item: updated });
      }
      case "relationship": {
        const data: Record<string, unknown> = {};
        const label = str("label", 80); if (label !== undefined) data.label = label;
        const relationshipType = str("relationshipType", 40); if (relationshipType !== undefined) data.relationshipType = relationshipType;
        if (typeof body.directed === "boolean") data.directed = body.directed;
        if (visibleAfter) data.visibleAfter = visibleAfter;
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        const updated = await prisma.companionRelationship.update({ where: { id }, data });
        return NextResponse.json({ item: updated });
      }
      case "timeline": {
        const data: Record<string, unknown> = {};
        const description = str("description", 500); if (description !== undefined) data.description = description;
        if (typeof body.importance === "number" && body.importance >= 1 && body.importance <= 5) {
          data.importance = Math.floor(body.importance);
        }
        if (visibleAfter) data.visibleAfter = visibleAfter;
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        const updated = await prisma.companionTimelineEvent.update({ where: { id }, data });
        return NextResponse.json({ item: updated });
      }
      case "glossary": {
        const data: Record<string, unknown> = {};
        const term = str("term", 80); if (term !== undefined) data.term = term;
        const definition = str("definition", 500); if (definition !== undefined) data.definition = definition;
        if ("category" in body) data.category = typeof body.category === "string" ? (body.category as string).slice(0, 40) : null;
        if (visibleAfter) data.visibleAfter = visibleAfter;
        if (typeof body.sortOrder === "number") data.sortOrder = Math.max(0, Math.floor(body.sortOrder));
        if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        const updated = await prisma.companionGlossaryTerm.update({ where: { id }, data });
        return NextResponse.json({ item: updated });
      }
    }
  } catch (err) {
    console.error("Companion item PATCH error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = await ctx.params;
  if (!isValidType(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  try {
    switch (type) {
      case "character": await prisma.companionCharacter.delete({ where: { id } }); break;
      case "fact":      await prisma.companionFact.delete({ where: { id } }); break;
      case "relationship": await prisma.companionRelationship.delete({ where: { id } }); break;
      case "timeline":  await prisma.companionTimelineEvent.delete({ where: { id } }); break;
      case "glossary":  await prisma.companionGlossaryTerm.delete({ where: { id } }); break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Companion item DELETE error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
