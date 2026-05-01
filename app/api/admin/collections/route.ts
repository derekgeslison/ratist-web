import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// Lists all official (Ratist-curated) collections — drafts and public —
// for the admin home. Public-only would hide drafts an admin is still
// tweaking; we want both visible in this surface.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const collections = await prisma.customCollection.findMany({
    where: { isOfficial: true },
    include: {
      user: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: "asc" }, take: 4, select: { posterPath: true } },
      _count: { select: { items: true, saves: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      slug: c.slug,
      visibility: c.visibility,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      itemCount: c._count.items,
      saveCount: c._count.saves,
      previewPosters: c.items.map((i) => i.posterPath).filter(Boolean) as string[],
      authoredBy: c.user?.name ?? null,
    })),
  });
}
