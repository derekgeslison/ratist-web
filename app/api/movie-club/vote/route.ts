import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST — vote for a candidate in a community_vote week */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId, tmdbId } = await req.json();
  if (!weekId || !tmdbId) return NextResponse.json({ error: "weekId and tmdbId required" }, { status: 400 });

  const week = await prisma.movieClubWeek.findUnique({ where: { id: weekId } });
  if (!week || week.pickMethod !== "community_vote" || week.status !== "upcoming") {
    return NextResponse.json({ error: "Voting is not open for this week" }, { status: 400 });
  }

  const member = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  if (!member) return NextResponse.json({ error: "Join the Movie Club first" }, { status: 403 });

  await prisma.movieClubVote.upsert({
    where: { userId_weekId: { userId: user.id, weekId } },
    create: { userId: user.id, weekId, tmdbId: Number(tmdbId) },
    update: { tmdbId: Number(tmdbId) },
  });

  // Return updated vote counts
  const votes = await prisma.movieClubVote.groupBy({
    by: ["tmdbId"],
    where: { weekId },
    _count: { tmdbId: true },
  });
  const voteCounts = Object.fromEntries(votes.map((v) => [v.tmdbId, v._count.tmdbId]));

  return NextResponse.json({ voted: true, voteCounts });
}
