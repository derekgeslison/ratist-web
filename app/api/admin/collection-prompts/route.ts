import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prompts = await prisma.collectionPrompt.findMany({
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { collections: true } },
    },
    // Active prompts first, then upcoming, then expired. Within each
    // bucket order by activeFrom desc so newer ones surface first.
    orderBy: [{ activeFrom: "desc" }],
  });

  return NextResponse.json({
    prompts: prompts.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      activeFrom: p.activeFrom?.toISOString() ?? null,
      activeTo: p.activeTo?.toISOString() ?? null,
      featured: p.featured,
      createdBy: p.createdBy?.name ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      collectionCount: p._count.collections,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  // Optional active window — both fields are nullable. Null = no time
  // bound (used for evergreen prompts that never expire).
  const activeFrom = parseDate(body?.activeFrom);
  const activeTo   = parseDate(body?.activeTo);
  const featured = !!body?.featured;

  const created = await prisma.collectionPrompt.create({
    data: {
      title,
      description: description || null,
      activeFrom,
      activeTo,
      featured,
      createdById: user.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ prompt: created });
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
