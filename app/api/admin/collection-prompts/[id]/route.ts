import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function parseDate(raw: unknown): Date | null | undefined {
  // Distinguish "leave the existing value alone" (undefined input) from
  // "explicitly clear the date" (null input). String inputs parse to a
  // Date or fail to undefined.
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 120);
    if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    data.title = t;
  }
  if (typeof body.description === "string" || body.description === null) {
    data.description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
  }
  const activeFrom = parseDate(body.activeFrom);
  if (activeFrom !== undefined) data.activeFrom = activeFrom;
  const activeTo = parseDate(body.activeTo);
  if (activeTo !== undefined) data.activeTo = activeTo;
  if (typeof body.featured === "boolean") data.featured = body.featured;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.collectionPrompt.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // CustomCollection.themePromptId is SetNull on delete, so any
  // collection still tagged to this prompt simply loses the link
  // rather than cascading.
  await prisma.collectionPrompt.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
