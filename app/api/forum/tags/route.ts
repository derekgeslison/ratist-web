import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/forum/tags — top tags by usage
export async function GET() {
  try {
    const tags = await prisma.forumThreadTag.groupBy({
      by: ["tag"],
      _count: { tag: true },
      orderBy: { _count: { tag: "desc" } },
      take: 20,
    });

    return NextResponse.json({
      tags: tags.map((t) => ({ tag: t.tag, count: t._count.tag })),
    });
  } catch {
    return NextResponse.json({ tags: [] });
  }
}
