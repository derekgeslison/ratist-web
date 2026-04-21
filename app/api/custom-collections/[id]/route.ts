import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await prisma.customCollection.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!c || c.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    collection: {
      id: c.id,
      name: c.name,
      description: c.description,
      prompt: c.prompt,
      mediaType: c.mediaType,
      createdAt: c.createdAt.toISOString(),
      items: c.items.map((i) => ({
        id: i.id,
        mediaType: i.mediaType,
        tmdbId: i.tmdbId,
        title: i.title,
        posterPath: i.posterPath,
        releaseDate: i.releaseDate,
        voteAverage: i.voteAverage,
        sortOrder: i.sortOrder,
      })),
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.customCollection.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.customCollection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
