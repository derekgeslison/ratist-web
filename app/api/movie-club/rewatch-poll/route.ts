import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId, vote } = await req.json();
  if (!weekId || !["yes", "no", "maybe"].includes(vote)) {
    return NextResponse.json({ error: "weekId and vote (yes/no/maybe) required" }, { status: 400 });
  }

  await prisma.movieClubRewatchPoll.upsert({
    where: { userId_weekId: { userId: user.id, weekId } },
    create: { userId: user.id, weekId, vote },
    update: { vote },
  });

  const counts = await prisma.movieClubRewatchPoll.groupBy({
    by: ["vote"],
    where: { weekId },
    _count: { vote: true },
  });
  const results = Object.fromEntries(counts.map((c) => [c.vote, c._count.vote]));

  return NextResponse.json({ voted: true, results });
}
