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

  return NextResponse.json({ years });
}
