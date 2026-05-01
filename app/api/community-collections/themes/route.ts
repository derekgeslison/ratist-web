import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const PREVIEWS_PER_PROMPT = 4;

// Active = current time falls within [activeFrom, activeTo]. Null bounds
// mean "no lower / upper bound" — used for evergreen prompts. The Theme
// tab on the community feed renders these as tiles, with each tile
// showing top-saved responses inline.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ prompts: [] });
  if (!user.isAdmin && !isSubscriptionActive(user)) return NextResponse.json({ prompts: [] });

  const now = new Date();
  const prompts = await prisma.collectionPrompt.findMany({
    where: {
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
        { OR: [{ activeTo: null },   { activeTo:   { gte: now } }] },
      ],
    },
    orderBy: [{ featured: "desc" }, { activeFrom: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      featured: true,
      activeFrom: true,
      activeTo: true,
      _count: {
        select: {
          collections: { where: { visibility: "public", publishedAt: { not: null } } },
        },
      },
    },
  });

  if (prompts.length === 0) return NextResponse.json({ prompts: [] });

  // Pull top-saved public responses per prompt in one shot. Prisma can't
  // do "top N per group" natively, so we fetch a wider pool and split
  // client-side. With small per-prompt response counts this stays cheap.
  const previewPool = await prisma.customCollection.findMany({
    where: {
      visibility: "public",
      publishedAt: { not: null },
      themePromptId: { in: prompts.map((p) => p.id) },
    },
    orderBy: [{ saveCount: "desc" }, { publishedAt: "desc" }],
    // Cap the pool so a single very-active prompt can't drag the
    // payload size up — PREVIEWS_PER_PROMPT × prompts.length is enough
    // for the UI but a bit of slack covers ties on saveCount.
    take: PREVIEWS_PER_PROMPT * prompts.length * 2,
    select: {
      id: true,
      name: true,
      slug: true,
      themePromptId: true,
      saveCount: true,
      isOfficial: true,
      user: { select: { firebaseUid: true, name: true } },
      items: { orderBy: { sortOrder: "asc" }, take: 4, select: { posterPath: true } },
    },
  });

  const previewsByPrompt = new Map<string, typeof previewPool>();
  for (const c of previewPool) {
    if (!c.themePromptId) continue;
    const existing = previewsByPrompt.get(c.themePromptId) ?? [];
    if (existing.length < PREVIEWS_PER_PROMPT) {
      existing.push(c);
      previewsByPrompt.set(c.themePromptId, existing);
    }
  }

  return NextResponse.json({
    prompts: prompts.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      featured: p.featured,
      activeFrom: p.activeFrom?.toISOString() ?? null,
      activeTo: p.activeTo?.toISOString() ?? null,
      responseCount: p._count.collections,
      previews: (previewsByPrompt.get(p.id) ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        saveCount: c.saveCount,
        isOfficial: c.isOfficial,
        curator: { firebaseUid: c.user.firebaseUid, name: c.user.name },
        previewPosters: c.items.map((i) => i.posterPath).filter(Boolean) as string[],
      })),
    })),
  });
}
