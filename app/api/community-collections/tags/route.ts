import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Top tags across public collections, ranked by usage. Used to populate the
// tag-filter pills on the community feed. Mirrors /api/forum/tags.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ tags: [] });
  if (!user.isAdmin && !isSubscriptionActive(user)) return NextResponse.json({ tags: [] });

  // groupBy on the tag column scoped to public collections. We have to
  // pre-resolve the eligible collection IDs because Prisma's groupBy
  // can't cross relations.
  const publicIds = await prisma.customCollection.findMany({
    where: { visibility: "public", publishedAt: { not: null } },
    select: { id: true },
  });
  if (publicIds.length === 0) return NextResponse.json({ tags: [] });

  const counts = await prisma.collectionTag.groupBy({
    by: ["tag"],
    where: { collectionId: { in: publicIds.map((c) => c.id) } },
    _count: { tag: true },
    orderBy: { _count: { tag: "desc" } },
    take: 20,
  });

  return NextResponse.json({
    tags: counts.map((c) => ({ tag: c.tag, count: c._count.tag })),
  });
}
