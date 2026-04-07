import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST — nominate a movie for a community_vote week */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId, tmdbId, title, posterPath, action } = await req.json();
  if (!weekId) return NextResponse.json({ error: "weekId required" }, { status: 400 });

  const member = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  if (!member) return NextResponse.json({ error: "Join the Movie Club first" }, { status: 403 });

  const week = await prisma.movieClubWeek.findUnique({ where: { id: weekId } });
  if (!week || week.status !== "voting") {
    return NextResponse.json({ error: "Voting is not open for this week" }, { status: 400 });
  }

  // Nominate
  if (action === "nominate") {
    if (!tmdbId || !title) return NextResponse.json({ error: "tmdbId and title required" }, { status: 400 });

    // Check for duplicate
    const existing = await prisma.movieClubNomination.findUnique({
      where: { weekId_tmdbId: { weekId, tmdbId: Number(tmdbId) } },
    });
    if (existing) return NextResponse.json({ error: "This movie has already been nominated for this week", alreadyNominated: true }, { status: 409 });

    const nom = await prisma.movieClubNomination.create({
      data: { weekId, userId: user.id, tmdbId: Number(tmdbId), title, posterPath: posterPath ?? null },
    });

    // Auto-vote for your own nomination
    await prisma.movieClubNominationVote.create({
      data: { nominationId: nom.id, userId: user.id },
    });

    return NextResponse.json({ nominated: true, nominationId: nom.id });
  }

  // Vote for an existing nomination
  if (action === "vote") {
    const nominationId = req.nextUrl.searchParams.get("nominationId") ?? tmdbId; // accept either
    if (!nominationId) return NextResponse.json({ error: "nominationId required" }, { status: 400 });

    // Check vote limit (max 3 per week)
    const voteCount = await prisma.movieClubNominationVote.count({
      where: { userId: user.id, nomination: { weekId } },
    });
    if (voteCount >= 3) return NextResponse.json({ error: "You can only vote for up to 3 movies per week" }, { status: 400 });

    // Check if already voted for this specific nomination
    const alreadyVoted = await prisma.movieClubNominationVote.findUnique({
      where: { nominationId_userId: { nominationId: String(nominationId), userId: user.id } },
    });
    if (alreadyVoted) return NextResponse.json({ error: "Already voted for this nomination" }, { status: 409 });

    await prisma.movieClubNominationVote.create({
      data: { nominationId: String(nominationId), userId: user.id },
    });

    return NextResponse.json({ voted: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
