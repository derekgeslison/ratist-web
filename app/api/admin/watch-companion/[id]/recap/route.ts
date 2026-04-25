import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Admin-only recap edit. Writes a single slot in the companion's
 * `recaps` JSON without touching the others — the moderator can fix a
 * typo or factual error in S3's installment recap without disturbing
 * S1/S2 or the series block.
 *
 * Body: {
 *   kind: "installment" | "series";
 *   season?: number | null;       // required for TV (matches the per-season slot key); ignored for movies
 *   text: string | null;          // null clears that slot
 * }
 */

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

type RecapsBlob = Record<string, unknown>;

function asBlob(v: unknown): RecapsBlob {
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...(v as RecapsBlob) };
  return {};
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as {
    kind?: unknown; season?: unknown; text?: unknown;
  } | null;

  const kind = body?.kind === "installment" || body?.kind === "series" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "kind must be 'installment' or 'series'" }, { status: 400 });

  // Cap text at 4000 chars — well above the 150-250 word target so a
  // longer-than-usual edit goes through, but not so high that someone
  // can paste a novel.
  const text = body?.text === null ? null
    : typeof body?.text === "string" ? body.text.trim().slice(0, 4000)
    : null;

  const companion = await prisma.watchCompanion.findUnique({
    where: { id },
    select: { id: true, mediaType: true, recaps: true },
  });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blob = asBlob(companion.recaps);

  if (companion.mediaType === "movie") {
    const current = (blob.current && typeof blob.current === "object" && !Array.isArray(blob.current))
      ? { ...(blob.current as Record<string, unknown>) }
      : {};
    if (text === null || text.length === 0) {
      delete current[kind];
    } else {
      current[kind] = text;
    }
    blob.current = current;
  } else {
    const seasonRaw = body?.season;
    const season = typeof seasonRaw === "number" && Number.isFinite(seasonRaw) && seasonRaw > 0 ? Math.floor(seasonRaw) : null;
    if (season === null) return NextResponse.json({ error: "season required for tv companions" }, { status: 400 });
    const key = String(season);
    const slot = (blob[key] && typeof blob[key] === "object" && !Array.isArray(blob[key]))
      ? { ...(blob[key] as Record<string, unknown>) }
      : {};
    if (text === null || text.length === 0) {
      delete slot[kind];
    } else {
      slot[kind] = text;
    }
    // If both fields gone, drop the season slot entirely so the
    // companion's recaps JSON stays clean.
    if (!slot.installment && !slot.series) {
      delete blob[key];
    } else {
      blob[key] = slot;
    }
  }

  await prisma.watchCompanion.update({
    where: { id },
    data: { recaps: blob as unknown as object },
  });

  return NextResponse.json({ ok: true });
}
