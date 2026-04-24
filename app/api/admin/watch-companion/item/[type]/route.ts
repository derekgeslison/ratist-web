import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/admin/watch-companion/item/:type
// Creates a new fact / relationship / timeline event / glossary term. The
// item's season scoping is inherited from its parent (companion or
// character) or taken explicitly from the body for items that can be
// scoped (timeline, glossary, relationship).

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

const CREATABLE_TYPES = ["fact", "relationship", "timeline", "glossary"] as const;
type CreatableType = (typeof CREATABLE_TYPES)[number];

function isCreatable(t: string): t is CreatableType {
  return (CREATABLE_TYPES as readonly string[]).includes(t);
}

type VisibleAfter = Record<string, number>;

function normVisibleAfter(raw: unknown): VisibleAfter {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: VisibleAfter = {};
  if (typeof o.seconds === "number" && o.seconds >= 0) out.seconds = Math.floor(o.seconds);
  if (typeof o.season === "number" && o.season > 0) out.season = Math.floor(o.season);
  if (typeof o.episode === "number" && o.episode > 0) out.episode = Math.floor(o.episode);
  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await ctx.params;
  if (!isCreatable(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

  const str = (k: string, max: number) => typeof body[k] === "string" ? (body[k] as string).slice(0, max) : null;
  const visibleAfter = normVisibleAfter(body.visibleAfter);

  try {
    switch (type) {
      case "fact": {
        const characterId = typeof body.characterId === "string" ? body.characterId : null;
        const fact = str("fact", 400);
        const factType = str("factType", 40) ?? "other";
        if (!characterId || !fact) return NextResponse.json({ error: "characterId + fact required" }, { status: 400 });
        // Confirm the character exists so we don't create an orphan fact.
        const exists = await prisma.companionCharacter.findUnique({ where: { id: characterId }, select: { id: true } });
        if (!exists) return NextResponse.json({ error: "Character not found" }, { status: 404 });
        const created = await prisma.companionFact.create({
          data: { characterId, fact, factType, visibleAfter },
        });
        return NextResponse.json({ item: created });
      }
      case "relationship": {
        const companionId = typeof body.companionId === "string" ? body.companionId : null;
        const fromCharacterId = typeof body.fromCharacterId === "string" ? body.fromCharacterId : null;
        const toCharacterId = typeof body.toCharacterId === "string" ? body.toCharacterId : null;
        const relationshipType = str("relationshipType", 40) ?? "other";
        const label = str("label", 80) ?? "related to";
        const directed = typeof body.directed === "boolean" ? body.directed : true;
        const seasonNumber = typeof body.seasonNumber === "number" && body.seasonNumber > 0 ? Math.floor(body.seasonNumber) : null;
        if (!companionId || !fromCharacterId || !toCharacterId) {
          return NextResponse.json({ error: "companionId + fromCharacterId + toCharacterId required" }, { status: 400 });
        }
        if (fromCharacterId === toCharacterId) {
          return NextResponse.json({ error: "Self-relationships aren't allowed" }, { status: 400 });
        }
        const created = await prisma.companionRelationship.create({
          data: { companionId, seasonNumber, fromCharacterId, toCharacterId, relationshipType, label, directed, visibleAfter },
        });
        return NextResponse.json({ item: created });
      }
      case "timeline": {
        const companionId = typeof body.companionId === "string" ? body.companionId : null;
        const description = str("description", 500);
        const importance = typeof body.importance === "number" && body.importance >= 1 && body.importance <= 5
          ? Math.floor(body.importance) : 3;
        const characterIds = Array.isArray(body.characterIds)
          ? (body.characterIds as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
        const seasonNumber = typeof body.seasonNumber === "number" && body.seasonNumber > 0 ? Math.floor(body.seasonNumber) : null;
        if (!companionId || !description) return NextResponse.json({ error: "companionId + description required" }, { status: 400 });
        const created = await prisma.companionTimelineEvent.create({
          data: { companionId, seasonNumber, description, importance, characterIds, visibleAfter },
        });
        return NextResponse.json({ item: created });
      }
      case "glossary": {
        const companionId = typeof body.companionId === "string" ? body.companionId : null;
        const term = str("term", 80);
        const definition = str("definition", 500);
        const category = typeof body.category === "string" && body.category.length > 0 ? body.category.slice(0, 40) : null;
        const seasonNumber = typeof body.seasonNumber === "number" && body.seasonNumber > 0 ? Math.floor(body.seasonNumber) : null;
        if (!companionId || !term || !definition) return NextResponse.json({ error: "companionId + term + definition required" }, { status: 400 });
        // Drop admin-added entries at the end of the existing glossary so
        // Sonnet's most-obscure-first ordering isn't disrupted.
        const lastSortOrder = await prisma.companionGlossaryTerm.findFirst({
          where: { companionId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const sortOrder = (lastSortOrder?.sortOrder ?? -1) + 1;
        const created = await prisma.companionGlossaryTerm.create({
          data: { companionId, seasonNumber, term, definition, category, visibleAfter, sortOrder },
        });
        return NextResponse.json({ item: created });
      }
    }
  } catch (err) {
    console.error("Companion item POST error:", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
