import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await prisma.forumCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { threads: true } },
        threads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            author: { select: { name: true } },
            _count: { select: { posts: true } },
          },
        },
      },
    });
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ categories: [] });
  }
}
