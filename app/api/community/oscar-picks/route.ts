import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const years = await prisma.oscarYear.findMany({
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
        include: {
          nominees: true,
          votes: { select: { nomineeId: true, userId: true } },
        },
      },
    },
    orderBy: { year: "desc" },
  });

  const categoryIds = years.flatMap((y) => y.categories.map((c) => c.id));
  const commentCounts = categoryIds.length > 0
    ? await prisma.comment.groupBy({
        by: ["targetId"],
        where: { targetType: "oscar_category", targetId: { in: categoryIds } },
        _count: { id: true },
      })
    : [];
  const commentMap = Object.fromEntries(commentCounts.map((c) => [c.targetId, c._count.id]));

  const yearsWithCounts = years.map((y) => ({
    ...y,
    categories: y.categories.map((cat) => ({
      ...cat,
      commentCount: commentMap[cat.id] ?? 0,
    })),
  }));

  return NextResponse.json({ years: yearsWithCounts });
}
